import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { resolveVehicleFilters } from "@/application/queries/vehicle-filters.query";
import { toDollars, type Dollars } from "@/lib/money";
import { getNextFleetWorkOrderStatus } from "@/domain/fleet/work-order-lifecycle";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
type FleetWorkOrderRow = Database["public"]["Tables"]["fleet_work_orders"]["Row"];
type FleetWorkOrderInsert = Database["public"]["Tables"]["fleet_work_orders"]["Insert"];
type FleetWorkOrderUpdate = Database["public"]["Tables"]["fleet_work_orders"]["Update"];
type FleetApprovalInsert = Database["public"]["Tables"]["fleet_approvals"]["Insert"];
type FleetWorkOrderLineItemInsert = Database["public"]["Tables"]["fleet_work_order_line_items"]["Insert"];
const db = supabase;

type FleetPurchaseOrderRow = Database["public"]["Tables"]["fleet_purchase_orders"]["Row"];

function parsePoLedgerPolicy(notes: string | null) {
  try {
    const parsed = notes ? JSON.parse(notes) : {};
    const policy = (parsed?.ledger_policy ?? parsed ?? {}) as Record<string, unknown>;
    return {
      maxPerJob: Number(policy.max_per_job || 0) || null,
      maxPerVehicle: Number(policy.max_per_vehicle || 0) || null,
      blockWorkWhenExceeded: policy.block_work_when_exceeded !== false,
      blockInvoicingWhenExceeded: policy.block_invoicing_when_exceeded !== false,
    };
  } catch {
    return {
      maxPerJob: null as number | null,
      maxPerVehicle: null as number | null,
      blockWorkWhenExceeded: true,
      blockInvoicingWhenExceeded: true,
    };
  }
}

function computePoRemaining(po: Pick<FleetPurchaseOrderRow, "amount_limit" | "amount_authorized" | "amount_consumed" | "amount_used">) {
  const limit = Number(po.amount_limit ?? 0);
  const authorized = Number(po.amount_authorized ?? 0);
  const consumed = Number(po.amount_consumed ?? po.amount_used ?? 0);
  return {
    limit,
    reserved: Math.max(0, authorized - consumed),
    consumed,
    remaining: Math.max(0, limit - authorized),
  };
}

function computeLedgerNetForEntries(entries: Array<{ entry_type: string; amount: Dollars | null }>) {
  let netReserved = 0;
  let consumed = 0;
  for (const entry of entries) {
    const amount = Number(entry.amount || 0);
    if (entry.entry_type === "authorized") {
      netReserved += amount;
    } else if (entry.entry_type === "released") {
      netReserved -= amount;
    } else if (["consumed", "adjusted"].includes(entry.entry_type)) {
      consumed += amount;
      netReserved -= amount;
    }
  }
  return { netReserved: Math.max(0, netReserved), consumed };
}

async function assertPoLedgerWithinLimits(input: {
  userId: string;
  poId: string;
  workOrderId: string;
  vehicleId: string | null;
  orderTotal: number;
  stage: "work" | "invoice";
}): Promise<void> {
  const [{ data: po }, { data: orderLedger }, { data: vehicleLedger }] = await Promise.all([
    supabase
      .from("fleet_purchase_orders")
      .select("id,po_number,notes,amount_limit,amount_authorized,amount_consumed,amount_used,status")
      .eq("id", input.poId)
      .eq("user_id", input.userId)
      .maybeSingle(),
    supabase
      .from("fleet_po_ledger_entries")
      .select("entry_type,amount")
      .eq("fleet_work_order_id", input.workOrderId)
      .eq("user_id", input.userId),
    input.vehicleId
      ? supabase
          .from("fleet_po_ledger_entries")
          .select("entry_type,amount")
          .eq("fleet_purchase_order_id", input.poId)
          .eq("user_id", input.userId)
          .contains("metadata", { vehicle_id: input.vehicleId })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (!po) throw new Error("Linked PO not found.");
  if (!["open", "partially_used"].includes(String(po.status || ""))) {
    throw new Error("PO is not active for authorization.");
  }

  const policy = parsePoLedgerPolicy(po.notes);
  const poState = computePoRemaining(po);
  const orderNet = computeLedgerNetForEntries((orderLedger || []) as Array<{ entry_type: string; amount: Dollars | null }>);
  const vehicleNet = computeLedgerNetForEntries((vehicleLedger || []) as Array<{ entry_type: string; amount: Dollars | null }>);

  if (policy.maxPerJob && input.orderTotal > policy.maxPerJob) {
    throw new Error(`PO max-per-job limit exceeded (${policy.maxPerJob.toFixed(2)}).`);
  }
  if (policy.maxPerVehicle && vehicleNet.netReserved > policy.maxPerVehicle) {
    throw new Error(`PO max-per-vehicle limit exceeded (${policy.maxPerVehicle.toFixed(2)}).`);
  }

  if (input.stage === "work" && !policy.blockWorkWhenExceeded) return;
  if (input.stage === "invoice" && !policy.blockInvoicingWhenExceeded) return;

  if (orderNet.netReserved <= 0) {
    throw new Error(input.stage === "invoice"
      ? "Invoicing blocked: no PO authorization reserved for this work order."
      : "Work is blocked: no PO authorization reserved for this work order.");
  }
  if (input.orderTotal > orderNet.netReserved) {
    throw new Error(input.stage === "invoice"
      ? "Invoicing blocked: invoice total exceeds reserved PO authorization for this work order."
      : "Work is blocked: total exceeds reserved PO authorization for this work order.");
  }
  if (poState.remaining < 0) {
    throw new Error("PO ledger balance is over-authorized.");
  }
}

async function transitionFleetWorkOrderStatus(input: {
  workOrderId: string;
  targetStatus: string;
  actorRole?: string;
  reasonCode?: string;
  details?: Json;
}): Promise<void> {
  const { error } = await db.rpc("transition_fleet_work_order", {
    p_work_order_id: input.workOrderId,
    p_target_status: input.targetStatus,
    p_actor_role: input.actorRole || "provider",
    p_reason_code: input.reasonCode || "manual",
    p_details: input.details || {},
  });
  if (error) {
    // Compatibility for environments where the lifecycle RPC was deployed before
    // fleet_work_orders.po_authorization_status. Completion does not use PO
    // authorization, so retain the owner completion path while the additive
    // schema migration rolls out. Never use this fallback for invoicing.
    const missingPoAuthorizationField = error.message?.includes('record "v_order" has no field "po_authorization_status"');
    if (missingPoAuthorizationField && ["in_progress", "completed"].includes(input.targetStatus)) {
      const { data: { user } } = await getCurrentAuthUser();
      if (!user) throw new Error("You must be logged in to update work orders.");
      const now = new Date().toISOString();
      const patch: FleetWorkOrderUpdate = {
        status: input.targetStatus,
        updated_at: now,
      };
      if (input.targetStatus === "completed") patch.completed_at = now;
      const { error: fallbackError } = await db
        .from("fleet_work_orders")
        .update(patch)
        .eq("id", input.workOrderId)
        .eq("user_id", user.id);
      if (fallbackError) throw new Error(fallbackError.message || "Failed lifecycle transition");
      return;
    }
    throw new Error(error.message || "Failed lifecycle transition");
  }
}

function buildDeterministicIdempotencyKey(parts: string[]): string {
  let hash = 2166136261;
  for (const part of parts) {
    for (let i = 0; i < part.length; i += 1) {
      hash ^= part.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
  }
  return `idemp_${(hash >>> 0).toString(36)}`;
}

async function acquireOperationLock(input: {
  userId: string;
  operationType: string;
  idempotencyKey: string;
  context?: Json;
}): Promise<{ batchId: string | null; duplicateCompleted: boolean }> {
  const { data: existing } = await db
    .from("fleet_operation_batches")
    .select("id,status")
    .eq("user_id", input.userId)
    .eq("operation_type", input.operationType)
    .eq("idempotency_key", input.idempotencyKey)
    .in("status", ["running", "completed"])
    .maybeSingle();
  if (existing?.status === "completed") {
    return { batchId: null, duplicateCompleted: true };
  }
  if (existing?.status === "running") {
    throw new Error("A matching operation is already in progress. Please retry after it completes.");
  }
  const { data: batch, error: insertError } = await db
    .from("fleet_operation_batches")
    .insert({
      user_id: input.userId,
      operation_type: input.operationType,
      status: "running",
      idempotency_key: input.idempotencyKey,
      context: input.context || {},
    })
    .select("id")
    .maybeSingle();
  if (insertError) {
    if (insertError.code !== "23505") {
      throw new Error(insertError.message || "Failed to acquire operation lock.");
    }
    const { data: collision } = await db
      .from("fleet_operation_batches")
      .select("id,status")
      .eq("user_id", input.userId)
      .eq("operation_type", input.operationType)
      .eq("idempotency_key", input.idempotencyKey)
      .in("status", ["running", "completed"])
      .maybeSingle();
    if (collision?.status === "completed") {
      return { batchId: null, duplicateCompleted: true };
    }
    throw new Error("A matching operation is already in progress. Please retry after it completes.");
  }
  return { batchId: String(batch?.id || ""), duplicateCompleted: false };
}

async function finalizeOperationLock(input: {
  userId: string;
  batchId: string | null;
  failed?: boolean;
  errorMessage?: string | null;
}): Promise<void> {
  if (!input.batchId) return;
  await db
    .from("fleet_operation_batches")
    .update({
      status: input.failed ? "failed" : "completed",
      completed_at: new Date().toISOString(),
      error_message: input.errorMessage || null,
    })
    .eq("id", input.batchId)
    .eq("user_id", input.userId);
}

export type DispatchScoreBreakdown = {
  technicianId: string;
  technicianName: string;
  totalScore: number;
  factors: {
    distance: number;
    timeFit: number;
    priority: number;
    grouping: number;
    load: number;
  };
  rationale: string[];
};

export interface RuntimeIntegrityOptions {
  idempotencyKey?: string | null;
  expectedStatus?: string | null;
  expectedUpdatedAt?: string | null;
  replayToken?: string | null;
}

type RuntimeOverrideAction =
  | "completion_gate"
  | "status_transition_exception"
  | "po_policy_exception"
  | "invoice_adjustment_exception";

type RuntimeOverrideReasonCode =
  | "vin_mismatch"
  | "location_window_exception"
  | "contract_rule_exception"
  | "service_package_missing"
  | "service_profile_missing"
  | "po_limit_exception"
  | "invoice_delta_exception"
  | "other";

export interface RuntimeOverrideRequest {
  action: RuntimeOverrideAction;
  reasonCode: RuntimeOverrideReasonCode;
  note?: string | null;
  approvalChain?: Array<{ approverUserId: string; approverRole: string; approvedAt: string }>;
}

const OVERRIDE_GOVERNANCE: Record<
  RuntimeOverrideAction,
  {
    allowedRoles: string[];
    allowedReasonCodes: RuntimeOverrideReasonCode[];
    requireApprovalChain: boolean;
    approvalMin: number;
  }
> = {
  completion_gate: {
    allowedRoles: ["admin", "provider_owner", "ops_manager", "fleet_manager"],
    allowedReasonCodes: [
      "vin_mismatch",
      "location_window_exception",
      "contract_rule_exception",
      "service_package_missing",
      "service_profile_missing",
      "other",
    ],
    requireApprovalChain: false,
    approvalMin: 0,
  },
  status_transition_exception: {
    allowedRoles: ["admin", "provider_owner", "ops_manager"],
    allowedReasonCodes: ["contract_rule_exception", "other"],
    requireApprovalChain: true,
    approvalMin: 1,
  },
  po_policy_exception: {
    allowedRoles: ["admin", "provider_owner", "finance_manager"],
    allowedReasonCodes: ["po_limit_exception", "other"],
    requireApprovalChain: true,
    approvalMin: 1,
  },
  invoice_adjustment_exception: {
    allowedRoles: ["admin", "provider_owner", "finance_manager"],
    allowedReasonCodes: ["invoice_delta_exception", "other"],
    requireApprovalChain: true,
    approvalMin: 1,
  },
};

function resolveActorRole(user: { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> }): string {
  return String(user.app_metadata?.role || user.user_metadata?.role || "provider_owner");
}

function assertRuntimeOverrideGovernance(input: {
  request: RuntimeOverrideRequest;
  actorRole: string;
}): void {
  const policy = OVERRIDE_GOVERNANCE[input.request.action];
  if (!policy) {
    throw new Error("Override action is not recognized by governance policy.");
  }
  if (!policy.allowedRoles.includes(input.actorRole)) {
    throw new Error(`Override action '${input.request.action}' is not permitted for role '${input.actorRole}'.`);
  }
  if (!policy.allowedReasonCodes.includes(input.request.reasonCode)) {
    throw new Error(`Reason code '${input.request.reasonCode}' is not allowed for '${input.request.action}'.`);
  }
  if (policy.requireApprovalChain) {
    const chain = input.request.approvalChain || [];
    if (chain.length < policy.approvalMin) {
      throw new Error(`Override action '${input.request.action}' requires an approval chain.`);
    }
  }
}

function assertOptimisticWorkOrderGuard(
  workOrder: { status?: string | null; updated_at?: string | null },
  options?: RuntimeIntegrityOptions | null,
): void {
  if (!options) return;
  if (options.expectedStatus && workOrder.status && workOrder.status !== options.expectedStatus) {
    throw new Error(`Stale action rejected: expected status '${options.expectedStatus}' but found '${workOrder.status}'.`);
  }
  if (options.expectedUpdatedAt && workOrder.updated_at && workOrder.updated_at !== options.expectedUpdatedAt) {
    throw new Error("Stale action rejected: work order changed since last read. Refresh and retry.");
  }
}

function resolveIntegrityIdempotencyKey(parts: string[], options?: RuntimeIntegrityOptions | null): string {
  if (options?.idempotencyKey && options.idempotencyKey.trim()) {
    return options.idempotencyKey.trim();
  }
  if (options?.replayToken && options.replayToken.trim()) {
    return buildDeterministicIdempotencyKey([...parts, options.replayToken.trim()]);
  }
  return buildDeterministicIdempotencyKey(parts);
}

export interface FleetChargeRequest {
  fleetWorkOrderId: string;
  paymentMethodId: string;
  amountOverride?: number | null;
  /** Stable per-attempt token so retries never create a second charge. */
  idempotencyKey: string;
}

export interface FleetChargeResult {
  success: boolean;
  paymentIntentId?: string;
  paymentRecordId?: string;
  status?: string;
  /** True only when Stripe has actually settled the payment. */
  settled?: boolean;
  duplicate?: boolean;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export async function chargeFleetWorkOrder(
  request: FleetChargeRequest,
): Promise<FleetChargeResult> {
  if (!request.fleetWorkOrderId || !request.paymentMethodId || !request.idempotencyKey) {
    return {
      success: false,
      error: {
        code: "validation_error",
        message: "Work order and payment method are required.",
      },
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke("fleet-charge-card", {
      body: {
        fleet_work_order_id: request.fleetWorkOrderId,
        payment_method_id: request.paymentMethodId,
        amount_override: request.amountOverride ?? null,
        idempotency_key: request.idempotencyKey,
      },
    });

    if (error) {
      const edgeError = error as { message?: string } | string;
      const message =
        (typeof edgeError === "object" ? edgeError?.message : undefined) ||
        (typeof error === "string" ? error : "Failed to process fleet charge.");

      return {
        success: false,
        error: {
          code: "edge_function_error",
          message,
          details: error,
        },
      };
    }

    const payload = (data ?? {}) as {
      payment_intent_id?: string;
      payment_record_id?: string;
      status?: string;
      settled?: boolean;
      duplicate?: boolean;
    };

    return {
      success: true,
      paymentIntentId: payload.payment_intent_id,
      paymentRecordId: payload.payment_record_id,
      status: payload.status,
      settled: payload.settled ?? payload.status === "succeeded",
      duplicate: payload.duplicate ?? false,
    };

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error processing fleet charge.";
    return {
      success: false,
      error: {
        code: "network_error",
        message,
        details: err,
      },
    };
  }
}

export interface CreateVanPayload {
  name: string;
  vin?: string | null;
  license_plate?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  assigned_technician_id?: string | null;
}

/**
 * Create a new van for the current user.
 */
export async function createVan(payload: CreateVanPayload): Promise<void> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) {
    throw new Error("You must be logged in to create vans.");
  }

  const { error } = await supabase.from("vans").insert([
    {
      user_id: user.id,
      name: payload.name,
      vin: payload.vin || null,
      license_plate: payload.license_plate || null,
      make: payload.make || null,
      model: payload.model || null,
      year: payload.year ?? null,
      assigned_technician_id: payload.assigned_technician_id || null,
    },
  ]);

  if (error) {
    console.error("[createVan] Error creating van", error);
    throw new Error("Failed to create van");
  }
}

export interface CreateFleetVehiclePayload {
  fleet_client_id: string;
  fleet_location_id?: string | null;
  fleet_contract_id?: string | null;
  year: number;
  make: string;
  model: string;
  unit_number?: string | null;
  vin?: string | null;
  license_plate?: string | null;
  mileage?: number | null;
  status: string;
  notes?: string | null;
  engine?: string | null;
  color?: string | null;
  fuel_type?: string | null;
  last_service_date?: string | null;
  last_service_mileage?: number | null;
  next_service_date?: string | null;
  next_service_mileage?: number | null;
}

/**
 * Create a new fleet vehicle for the current user.
 */
export async function createFleetVehicle(
  payload: CreateFleetVehiclePayload,
): Promise<{ id: string; warnings: string[] }> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) {
    throw new Error("You must be logged in to create fleet vehicles.");
  }

  const { validateFleetVehicle, assertValid } = await import("@/application/validation/fleet-validation");
  const result = validateFleetVehicle(payload);
  assertValid(result, "Cannot create vehicle");

  const { data, error } = await supabase.from("fleet_vehicles").insert([
    {
      user_id: user.id,
      fleet_client_id: payload.fleet_client_id,
      fleet_location_id: payload.fleet_location_id || null,
      fleet_contract_id: payload.fleet_contract_id || null,
      year: payload.year,
      make: payload.make,
      model: payload.model,
      unit_number: payload.unit_number || null,
      vin: payload.vin ? payload.vin.trim().toUpperCase() : null,
      license_plate: payload.license_plate || null,
      mileage: payload.mileage ?? null,
      status: payload.status,
      notes: payload.notes || null,
      engine: payload.engine ?? null,
      color: payload.color ?? null,
      fuel_type: payload.fuel_type ?? null,
      last_service_date: payload.last_service_date ?? null,
      last_service_mileage: payload.last_service_mileage ?? null,
      next_service_date: payload.next_service_date ?? null,
      next_service_mileage: payload.next_service_mileage ?? null,
    },
  ]).select("id").single();

  if (error || !data) {
    console.error("[createFleetVehicle] Error creating fleet vehicle", error);
    throw new Error("Failed to create fleet vehicle");
  }
  return { id: String(data.id), warnings: result.warnings };
}


export interface CreateFleetWorkOrderPayload {
  clientId?: string | null;
  vehicleId: string;
  contractId?: string | null;
  locationId?: string | null;
  serviceProfileId?: string | null;
  servicePackage?: {
    code: string;
    label: string;
    estimatedAmount?: number | null;
    oilSpec: string | null;
    oilCapacityQuarts: number | null;
    baseLaborServicePackage: string | null;
    checklist: string[];
    estimatedDurationMinutes: number;
  } | null;
  serviceType?: string | null;
  description?: string | null;
  priority: string;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  poNumber?: string | null;
  notes?: string | null;
  serviceDefaults?: {
    oilSpec?: string | null;
    oilCapacityQuarts?: number | null;
    recommendedServiceType?: string | null;
    baseLaborServicePackage?: string | null;
    source?: string | null;
  } | null;
  asDraft?: boolean;
  sourceScheduleId?: string | null;
}

export interface CreateFleetWorkOrderResult {
  id: string;
  orderNumber: string | null;
}

export async function createFleetWorkOrder(
  payload: CreateFleetWorkOrderPayload,
): Promise<CreateFleetWorkOrderResult> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) {
    throw new Error("You must be logged in to create work orders.");
  }

  const { data: vehicle } = await supabase
    .from("fleet_vehicles")
    .select("id, fleet_client_id, fleet_location_id, fleet_contract_id")
    .eq("id", payload.vehicleId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!vehicle) {
    throw new Error("Selected vehicle is invalid.");
  }

  // Validate (block on DB+linkage+finance gaps; warnings are emitted for the UI).
  const { validateFleetWorkOrder, assertValid } = await import("@/application/validation/fleet-validation");
  assertValid(
    validateFleetWorkOrder({
      vehicleId: payload.vehicleId,
      vehicleClientId: vehicle.fleet_client_id,
      servicePackage: payload.servicePackage ?? null,
      description: payload.description ?? null,
      scheduledDate: payload.scheduledDate ?? null,
      priority: payload.priority ?? null,
    }),
    "Cannot create work order",
  );


  // DB+linkage rule: vehicle must reference a client. Location/contract are optional.
  if (!vehicle.fleet_client_id) {
    throw new Error("Vehicle is not linked to a fleet client — fix the vehicle first.");
  }

  // Soft consistency: warn if payload diverges from vehicle linkage, but don't block.
  const divergedClient = payload.clientId && payload.clientId !== vehicle.fleet_client_id;
  if (divergedClient) {
    throw new Error("Work order client must match the vehicle's fleet client.");
  }

  const clientId = vehicle.fleet_client_id;
  const locationId = vehicle.fleet_location_id ?? payload.locationId ?? null;
  const contractId = vehicle.fleet_contract_id ?? payload.contractId ?? null;

  // Contract is optional — only enforce contract-driven rules when one is linked.
  let contract: { id: string; sla_hours: number | null; approval_threshold: number | null; pricing_rules: unknown } | null = null;
  if (contractId) {
    const { data: c } = await supabase
      .from("fleet_contracts")
      .select("id, sla_hours, approval_threshold, pricing_rules")
      .eq("id", contractId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!c) throw new Error("Vehicle-linked contract is invalid.");
    contract = c as typeof contract;
  }

  const pricingRules = (contract?.pricing_rules as Record<string, unknown> | null) ?? null;
  const approvalRules = (pricingRules?.approval as Record<string, unknown> | null) ?? null;
  const poRules = (pricingRules?.po as Record<string, unknown> | null) ?? null;
  const serviceScopeRules = (pricingRules?.service_scope as Record<string, unknown> | null) ?? null;
  const schedulingRules = (pricingRules?.scheduling as Record<string, unknown> | null) ?? null;
  const poRequiredByContract =
    Boolean(poRules?.requires_po) ||
    Boolean(pricingRules?.requires_po) ||
    Boolean(pricingRules?.po_required) ||
    Boolean(pricingRules?.poRequired);

  const poIsRequired = poRequiredByContract;
  if (poIsRequired && !payload.poNumber) {
    throw new Error("A valid PO is required by the selected contract.");
  }


  let selectedPo: (Pick<FleetPurchaseOrderRow, "id" | "status" | "amount_limit" | "amount_authorized" | "amount_consumed" | "amount_used" | "fleet_client_id" | "po_number" | "notes">) | null = null;
  const reserveAmount = Math.max(0, Number(payload.servicePackage?.estimatedAmount ?? 0));

  if (payload.poNumber) {
    const { data: po } = await supabase
      .from("fleet_purchase_orders")
      .select("id, po_number, status, amount_limit, amount_authorized, amount_consumed, amount_used, notes, fleet_client_id")
      .eq("user_id", user.id)
      .eq("po_number", payload.poNumber)
      .maybeSingle();

    if (!po || po.fleet_client_id !== clientId || !["open", "partially_used"].includes(String(po.status || ""))) {
      throw new Error("PO is missing, invalid, or has no remaining available amount.");
    }

    const poState = computePoRemaining(po);
    const policy = parsePoLedgerPolicy(po.notes);
    if (poState.remaining <= 0) {
      throw new Error("PO has no remaining available balance.");
    }
    if (policy.maxPerJob && reserveAmount > policy.maxPerJob) {
      throw new Error(`PO max-per-job limit exceeded (${policy.maxPerJob.toFixed(2)}).`);
    }

    if (policy.maxPerVehicle && reserveAmount > 0) {
      const { data: vehicleLedger } = await supabase
        .from("fleet_po_ledger_entries")
        .select("amount, entry_type, metadata")
        .eq("fleet_purchase_order_id", po.id)
        .eq("user_id", user.id);

      const vehicleAuthorized = (vehicleLedger || [])
        .filter((entry) => String((entry.metadata as Record<string, unknown> | null)?.vehicle_id || "") === payload.vehicleId && entry.entry_type === "authorized")
        .reduce((acc: number, entry) => acc + Number(entry.amount || 0), 0);

      if (vehicleAuthorized + reserveAmount > policy.maxPerVehicle) {
        throw new Error(`PO max-per-vehicle limit exceeded (${policy.maxPerVehicle.toFixed(2)}).`);
      }
    }

    if (reserveAmount > 0 && reserveAmount > poState.remaining) {
      throw new Error("PO remaining balance is insufficient for this work order reservation.");
    }
    selectedPo = po;
  }

  const status = payload.asDraft ? "draft" : "scheduled";
  const now = new Date().toISOString();

  if (!payload.asDraft) {
    if (!payload.scheduledDate || !payload.scheduledTime) {
      throw new Error("Scheduled date and time are required.");
    }

    if (!payload.servicePackage || !payload.serviceType) {
      throw new Error("Structured service package selection is required.");
    }

    // Contract scope: if the contract has explicitly attached services
    // (fleet_contract_services), those define the scope — any service on the
    // contract is in-scope by definition. Only fall back to the legacy
    // pricing_rules.service_scope.allowed_service_classes list when no
    // services are attached to the contract.
    let contractScopedIn = false;
    if (contractId && payload.servicePackage?.code) {
      const { data: attachedServices } = await supabase
        .from("fleet_contract_services")
        .select("id, service_catalog_id, custom_label, service_catalog:service_catalog_id(name)")
        .eq("user_id", user.id)
        .eq("fleet_contract_id", contractId)
        .eq("is_active", true);
      const attached = (attachedServices ?? []) as Array<{
        id: string;
        service_catalog_id: string;
        custom_label: string | null;
        service_catalog: { name: string } | null;
      }>;
      if (attached.length > 0) {
        const pkgCode = String(payload.servicePackage.code);
        const pkgLabel = String(payload.servicePackage.label ?? payload.serviceType ?? "").toLowerCase();
        contractScopedIn = attached.some((row) => {
          if (row.id === pkgCode) return true;
          if (row.service_catalog_id === pkgCode) return true;
          const candidates = [row.custom_label, row.service_catalog?.name]
            .filter(Boolean)
            .map((v) => String(v).toLowerCase());
          return candidates.includes(pkgLabel);
        });
        if (!contractScopedIn) {
          throw new Error("Selected service is not on this contract — attach it in Contract Services or pick a contract service.");
        }
      }
    }

    if (!contractScopedIn) {
      const allowedServiceClasses = Array.isArray(serviceScopeRules?.allowed_service_classes)
        ? (serviceScopeRules!.allowed_service_classes as unknown[]).map((entry) => String(entry))
        : [];
      if (allowedServiceClasses.length > 0 && !allowedServiceClasses.includes(payload.serviceType ?? "")) {
        throw new Error("Service type is outside the contract scope.");
      }
    }

    const { data: location } = await supabase
      .from("fleet_locations")
      .select("service_window_start, service_window_end")
      .eq("id", locationId)
      .eq("user_id", user.id)
      .maybeSingle();

    const proposedMinutes = Number.parseInt(payload.scheduledTime.slice(0, 2), 10) * 60 + Number.parseInt(payload.scheduledTime.slice(3, 5), 10);
    const startWindow = location?.service_window_start || "08:00";
    const endWindow = location?.service_window_end || "17:00";
    const startMinutes = Number.parseInt(startWindow.slice(0, 2), 10) * 60 + Number.parseInt(startWindow.slice(3, 5), 10);
    const endMinutes = Number.parseInt(endWindow.slice(0, 2), 10) * 60 + Number.parseInt(endWindow.slice(3, 5), 10);

    const enforceLocationWindows = schedulingRules?.enforce_location_windows !== false;
    if (enforceLocationWindows && (proposedMinutes < startMinutes || proposedMinutes >= endMinutes)) {
      throw new Error("Selected time is outside the location service window.");
    }

    const enforceSlaWindow = schedulingRules?.enforce_sla_window !== false;
    if (enforceSlaWindow && contract?.sla_hours) {
      const proposedDateTime = new Date(`${payload.scheduledDate}T${payload.scheduledTime}:00`);
      const maxSlaDateTime = new Date(Date.now() + contract.sla_hours * 60 * 60 * 1000);
      if (proposedDateTime > maxSlaDateTime) {
        throw new Error(`Scheduled slot exceeds contract SLA (${contract.sla_hours}h).`);
      }
    }
  }

  const insertData: FleetWorkOrderInsert = {
    user_id: user.id,
    fleet_client_id: clientId,
    fleet_vehicle_id: payload.vehicleId,
    fleet_contract_id: contractId || null,
    fleet_location_id: locationId || null,
    status,
    priority: payload.priority,
    service_type: payload.serviceType || null,
    description: payload.description || null,
    scheduled_date: payload.scheduledDate || null,
    scheduled_time: payload.scheduledTime || null,
    po_number: payload.poNumber || null,
    fleet_purchase_order_id: selectedPo?.id || null,
    notes: payload.notes || null,
    parts_used: payload.serviceDefaults || payload.servicePackage
      ? ({
          selected_service_profile_id: payload.serviceProfileId || null,
          selected_service_package: payload.servicePackage || null,
          contract_rule_snapshot: {
            approval: approvalRules,
            po: poRules,
            service_scope: serviceScopeRules,
            scheduling: schedulingRules,
          },
          service_defaults: payload.serviceDefaults,
        } as unknown as FleetWorkOrderInsert["parts_used"])
      : null,
  };
  insertData.source_schedule_id = payload.sourceScheduleId || null;

  if (!payload.asDraft) {
    insertData.submitted_at = now;
    const approvalMode = String(approvalRules?.mode || "hybrid");
    const approvalThreshold = Number(approvalRules?.threshold_amount ?? contract.approval_threshold ?? 0);
    insertData.approval_threshold = approvalThreshold || null;
    insertData.approval_required = approvalMode === "manual" || (approvalMode === "hybrid" && approvalThreshold > 0);

    if (contract?.sla_hours) {
      const slaMs = contract.sla_hours * 60 * 60 * 1000;
      insertData.sla_deadline = new Date(Date.now() + slaMs).toISOString();
    }
  }

  const { data, error } = await supabase
    .from("fleet_work_orders")
    .insert(insertData)
    .select("id, order_number")
    .single();

  if (error || !data) {
    console.error("[createFleetWorkOrder] Error creating work order", error);
    throw new Error(error?.message ? `Failed to create work order: ${error.message}` : "Failed to create work order");
  }

  if (selectedPo && reserveAmount > 0) {
    const projectedAuthorized = Number(selectedPo.amount_authorized || 0) + reserveAmount;
    const { data: updatedPo, error: poUpdateError } = await supabase
      .from("fleet_purchase_orders")
      .update({
        amount_authorized: projectedAuthorized,
        status: projectedAuthorized >= Number(selectedPo.amount_limit || 0) ? "partially_used" : selectedPo.status,
      })
      .eq("id", selectedPo.id)
      .eq("user_id", user.id)
      .eq("amount_authorized", Number(selectedPo.amount_authorized || 0))
      .select("id")
      .maybeSingle();

    if (poUpdateError || !updatedPo) {
      await supabase.from("fleet_work_orders").delete().eq("id", data.id).eq("user_id", user.id);
      throw new Error("Failed to reserve PO authorization due to concurrent ledger update. Please retry.");
    }

    const { error: reserveLedgerError } = await supabase.from("fleet_po_ledger_entries").insert({
      user_id: user.id,
      fleet_purchase_order_id: selectedPo.id,
      fleet_work_order_id: data.id,
      entry_type: "authorized",
      amount: reserveAmount,
      reason_code: "work_order_created_reserved",
      metadata: {
        vehicle_id: payload.vehicleId,
        po_number: selectedPo.po_number,
      },
    });
    if (reserveLedgerError) {
      await supabase
        .from("fleet_purchase_orders")
        .update({
          amount_authorized: Number(selectedPo.amount_authorized || 0),
          status: selectedPo.status,
        })
        .eq("id", selectedPo.id)
        .eq("user_id", user.id);
      await supabase.from("fleet_work_orders").delete().eq("id", data.id).eq("user_id", user.id);
      throw new Error("Failed to write PO ledger reservation. Work order creation was rolled back.");
    }
  }

  // ── Auto-apply contract services as line items ──
  if (contractId) {
    const { data: existingItems } = await supabase
      .from("fleet_work_order_line_items")
      .select("id")
      .eq("fleet_work_order_id", data.id)
      .limit(1);

    if (!existingItems?.length) {
      const { data: contractServices } = await supabase
        .from("fleet_contract_services")
        .select("id, custom_price, custom_label, pricing_model, sort_order, service_catalog_id, service_catalog(id, name, description, default_price)")
        .eq("fleet_contract_id", contractId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (contractServices?.length) {
        const lineItems = contractServices.map((cs, idx: number) => {
          const unitPrice = cs.custom_price ?? cs.service_catalog?.default_price ?? 0;
          return {
            user_id: user.id,
            fleet_work_order_id: data.id,
            fleet_contract_service_id: cs.id,
            service_catalog_id: cs.service_catalog_id,
            description: cs.custom_label || cs.service_catalog?.name || "Service",
            unit_price: unitPrice,
            quantity: 1,
            total: unitPrice,
            price_source: "contract",
            line_type: "service",
            taxable: true,
            sort_order: cs.sort_order ?? idx,
          };
        });

        await supabase.from("fleet_work_order_line_items").insert(lineItems);

        const totalAmount = lineItems.reduce((sum: number, li) => sum + Number(li.total), 0);
        await supabase
          .from("fleet_work_orders")
          .update({ total: totalAmount })
          .eq("id", data.id)
          .eq("user_id", user.id);
      }
    }
  }

  await supabase.from("fleet_activity_logs").insert({
    fleet_work_order_id: data.id,
    user_id: user.id,
    action: "created",
    actor_role: "provider",
    details: { message: `Work order ${data.order_number} created` },
  });

  if (!payload.asDraft) {
    await supabase.from("fleet_activity_logs").insert({
      fleet_work_order_id: data.id,
      user_id: user.id,
      action: "submitted",
      actor_role: "provider",
      details: { message: "Submitted and scheduled" },
    });
  }

  if (payload.poNumber) {
    await supabase.from("fleet_activity_logs").insert({
      fleet_work_order_id: data.id,
      user_id: user.id,
      action: "po_attached",
      actor_role: "provider",
      details: { po_number: payload.poNumber },
    });
  }

  return { id: String(data.id), orderNumber: data.order_number ?? null };
}

export interface GenerateWorkOrdersFromSchedulesResult {
  generatedCount: number;
  skippedCount: number;
}

export async function generateWorkOrdersFromApprovedSchedules(limit = 100): Promise<GenerateWorkOrdersFromSchedulesResult> {
  const {
    data: { user },
  } = await getCurrentAuthUser();
  if (!user) throw new Error("You must be logged in to generate work orders.");

  const { data: schedules } = await db
    .from("fleet_service_schedules")
    .select("id,fleet_client_id,fleet_vehicle_id,service_class,base_labor_package,proposed_scheduled_date,proposed_scheduled_time,draft_work_order_id")
    .eq("user_id", user.id)
    .in("queue_status", ["approved", "scheduled"])
    .is("draft_work_order_id", null)
    .limit(limit);

  const idempotencyKey = buildDeterministicIdempotencyKey([
    user.id,
    "work_order_generation",
    ...(schedules || []).map((schedule: { id: string }) => String(schedule.id)).sort(),
  ]);

  const operationLock = await acquireOperationLock({
    userId: user.id,
    operationType: "work_order_generation",
    idempotencyKey,
    context: { limit, schedule_count: (schedules || []).length },
  });
  if (operationLock.duplicateCompleted) {
    return { generatedCount: 0, skippedCount: (schedules || []).length };
  }

  const batchId = operationLock.batchId || undefined;
  let generatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  try {
    for (const schedule of schedules || []) {
      if (batchId) {
        await db.from("fleet_operation_batch_items").upsert({
          batch_id: batchId,
          item_key: String(schedule.id),
          status: "pending",
          payload: { fleet_vehicle_id: schedule.fleet_vehicle_id },
        });
      }

      const { data: existing } = await db
        .from("fleet_work_orders")
        .select("id")
        .eq("user_id", user.id)
        .eq("source_schedule_id", schedule.id)
        .maybeSingle();
      if (existing?.id) {
        await db
          .from("fleet_service_schedules")
          .update({ queue_status: "work_order_generated", draft_work_order_id: existing.id })
          .eq("id", schedule.id)
          .eq("user_id", user.id);
        skippedCount += 1;
        if (batchId) {
          await db.from("fleet_operation_batch_items").upsert({
            batch_id: batchId,
            item_key: String(schedule.id),
            status: "skipped",
            compensation_action: "existing_work_order_linked",
          });
        }
        continue;
      }

      const { data: vehicle } = await supabase
        .from("fleet_vehicles")
        .select("fleet_client_id,fleet_location_id,fleet_contract_id")
        .eq("id", schedule.fleet_vehicle_id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!vehicle || (schedule.fleet_client_id && vehicle.fleet_client_id !== schedule.fleet_client_id)) {
        skippedCount += 1;
        failedCount += 1;
        if (batchId) {
          await db.from("fleet_operation_batch_items").upsert({
            batch_id: batchId,
            item_key: String(schedule.id),
            status: "failed",
            error_message: "Vehicle lookup/context mismatch",
          });
        }
        continue;
      }

      const asDraft = !schedule.proposed_scheduled_date;
      const { data: workOrder, error: workOrderError } = await db
        .from("fleet_work_orders")
        .insert({
          user_id: user.id,
          fleet_client_id: schedule.fleet_client_id,
          fleet_vehicle_id: schedule.fleet_vehicle_id,
          fleet_contract_id: vehicle.fleet_contract_id,
          fleet_location_id: vehicle.fleet_location_id,
          status: asDraft ? "draft" : "scheduled",
          priority: "normal",
          service_type: schedule.service_class,
          description: schedule.base_labor_package ?? "Scheduled fleet service",
          scheduled_date: schedule.proposed_scheduled_date,
          scheduled_time: schedule.proposed_scheduled_time || null,
          source_schedule_id: schedule.id,
          submitted_at: asDraft ? null : new Date().toISOString(),
        })
        .select("id")
        .maybeSingle();

      if (!workOrder || workOrderError) {
        skippedCount += 1;
        failedCount += 1;
        if (batchId) {
          await db.from("fleet_operation_batch_items").upsert({
            batch_id: batchId,
            item_key: String(schedule.id),
            status: "failed",
            error_message: workOrderError?.message || "work order insert failed",
          });
        }
        continue;
      }

      await db
        .from("fleet_service_schedules")
        .update({
          queue_status: "work_order_generated",
          draft_work_order_id: workOrder.id,
          status: schedule.proposed_scheduled_date ? "scheduled" : "generated",
        })
        .eq("id", schedule.id)
        .eq("user_id", user.id);

      generatedCount += 1;
      if (batchId) {
        await db.from("fleet_operation_batch_items").upsert({
          batch_id: batchId,
          item_key: String(schedule.id),
          status: "succeeded",
          payload: { work_order_id: workOrder.id },
        });
      }
    }
  } catch (error) {
    await finalizeOperationLock({
      userId: user.id,
      batchId: operationLock.batchId,
      failed: true,
      errorMessage: error instanceof Error ? error.message : "Generation run failed",
    });
    throw error;
  }

  await db
    .from("fleet_operation_batches")
    .update({
      context: { generatedCount, skippedCount, failedCount },
    })
    .eq("id", operationLock.batchId)
    .eq("user_id", user.id);

  await finalizeOperationLock({
    userId: user.id,
    batchId: operationLock.batchId,
    failed: failedCount > 0,
    errorMessage: failedCount > 0 ? `${failedCount} schedule items failed` : null,
  });

  return { generatedCount, skippedCount };
}

export async function getFleetDispatchScoreBreakdown(workOrderId: string): Promise<DispatchScoreBreakdown[]> {
  const {
    data: { user },
  } = await getCurrentAuthUser();
  if (!user) throw new Error("You must be logged in to score dispatch assignments.");

  const [{ data: order }, { data: technicians }, { data: activeAssignments }] = await Promise.all([
    db
      .from("fleet_work_orders")
      .select("id,fleet_client_id,priority")
      .eq("id", workOrderId)
      .eq("user_id", user.id)
      .maybeSingle(),
    db.from("technicians").select("id,name").eq("is_active", true),
    db
      .from("fleet_work_orders")
      .select("assigned_technician_id,fleet_client_id,status")
      .eq("user_id", user.id)
      .in("status", ["scheduled", "en_route", "in_progress"]),
  ]);

  if (!order) return [];

  const loadByTech = new Map<string, number>();
  const groupingByTech = new Map<string, number>();
  for (const item of activeAssignments || []) {
    const techId = String(item.assigned_technician_id || "");
    if (!techId) continue;
    loadByTech.set(techId, (loadByTech.get(techId) || 0) + 1);
    if (item.fleet_client_id && item.fleet_client_id === order.fleet_client_id) {
      groupingByTech.set(techId, (groupingByTech.get(techId) || 0) + 1);
    }
  }

  const priorityWeight = order.priority === "urgent" ? 1 : order.priority === "high" ? 0.85 : 0.7;

  return (technicians || [])
    .map((tech: { id: string; name: string }) => {
      const currentLoad = loadByTech.get(tech.id) || 0;
      const groupingHits = groupingByTech.get(tech.id) || 0;
      const load = Math.max(0, 100 - currentLoad * 20);
      const grouping = Math.min(100, 40 + groupingHits * 30);
      const distance = Math.max(40, 95 - currentLoad * 10);
      const timeFit = Math.max(35, 90 - currentLoad * 15);
      const priority = Math.round(priorityWeight * 100);
      const totalScore = Math.round(load * 0.2 + grouping * 0.25 + distance * 0.25 + timeFit * 0.2 + priority * 0.1);
      return {
        technicianId: tech.id,
        technicianName: tech.name,
        totalScore,
        factors: { distance, timeFit, priority, grouping, load },
        rationale: [
          `${currentLoad} active assignment(s)`,
          `${groupingHits} same-fleet grouping match(es)`,
          `priority weight ${priority}%`,
        ],
      };
    })
    .sort((a: DispatchScoreBreakdown, b: DispatchScoreBreakdown) => b.totalScore - a.totalScore);
}

export async function advanceFleetWorkOrderStatus(
  workOrderId: string,
  options?: RuntimeIntegrityOptions,
): Promise<void> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) {
    throw new Error("You must be logged in to update work orders.");
  }

  const { data: order, error } = await supabase
    .from("fleet_work_orders")
    .select("*,updated_at, fleet_contracts(sla_hours)")
    .eq("id", workOrderId)
    .eq("user_id", user.id)
    .single();

  if (error || !order) {
    console.error("[advanceFleetWorkOrderStatus] Error fetching work order", error);
    throw new Error("Failed to load work order");
  }

  const nextStatus = getNextFleetWorkOrderStatus(order.status);
  if (!nextStatus) throw new Error(`Unsupported work order transition from '${order.status}'.`);
  if (["draft", "pending_review"].includes(order.status) && nextStatus === "scheduled" && (!order.scheduled_date || !order.scheduled_time)) {
    throw new Error("Work order must have a scheduled date and time before submission.");
  }
  if (nextStatus === "invoiced" && Number(order.total || 0) <= 0) {
    throw new Error("Cannot invoice a work order with zero total.");
  }
  if (["in_progress", "completed", "invoiced"].includes(nextStatus) && order.fleet_purchase_order_id) {
    await assertPoLedgerWithinLimits({
      userId: user.id,
      poId: order.fleet_purchase_order_id,
      workOrderId,
      vehicleId: order.fleet_vehicle_id,
      orderTotal: Number(order.total || 0),
      stage: nextStatus === "invoiced" ? "invoice" : "work",
    });
  }

  await transitionFleetWorkOrderStatus({
    workOrderId,
    targetStatus: nextStatus,
    actorRole: "provider",
    reasonCode: "manual_advance",
    details: { old_status: order.status, next_status: nextStatus },
  });

  const orderWithContract = order as FleetWorkOrderRow & {
    fleet_contracts?: { sla_hours?: number | null } | null;
  };
  if (nextStatus === "scheduled" && orderWithContract.fleet_contracts?.sla_hours) {
    const slaMs = orderWithContract.fleet_contracts.sla_hours * 60 * 60 * 1000;
    await supabase
      .from("fleet_work_orders")
      .update({ sla_deadline: new Date(Date.now() + slaMs).toISOString() })
      .eq("id", workOrderId)
      .eq("user_id", user.id);
  }
}

export interface CompleteFleetWorkOrderPayload {
  workOrderId: string;
  mileageAtService: number;
  capturedVin?: string | null;
  technicianNotes?: string | null;
  completionOverride?: {
    reasonCode:
      | "vin_mismatch"
      | "location_window_exception"
      | "contract_rule_exception"
      | "service_package_missing"
      | "service_profile_missing"
      | "other";
    note?: string | null;
  } | null;
}

export async function completeFleetWorkOrderWithDetails(
  payload: CompleteFleetWorkOrderPayload,
): Promise<void> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) {
    throw new Error("You must be logged in to complete work orders.");
  }

  if (!Number.isFinite(payload.mileageAtService) || payload.mileageAtService <= 0) {
    throw new Error("Mileage at completion is required.");
  }

  const { data: order, error } = await supabase
    .from("fleet_work_orders")
    .select("id, fleet_vehicle_id, fleet_location_id, fleet_contract_id, status, parts_used")
    .eq("id", payload.workOrderId)
    .eq("user_id", user.id)
    .single();

  if (error || !order) {
    console.error("[completeFleetWorkOrderWithDetails] Error fetching work order", error);
    throw new Error("Failed to load work order");
  }

  const [{ data: vehicle }, { data: location }, { data: contract }] = await Promise.all([
    supabase
      .from("fleet_vehicles")
      .select("vin")
      .eq("id", order.fleet_vehicle_id)
      .eq("user_id", user.id)
      .maybeSingle(),
    order.fleet_location_id
      ? supabase
          .from("fleet_locations")
          .select("service_window_start,service_window_end")
          .eq("id", order.fleet_location_id)
          .eq("user_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    order.fleet_contract_id
      ? supabase
          .from("fleet_contracts")
          .select("pricing_rules")
          .eq("id", order.fleet_contract_id)
          .eq("user_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const normalizeVin = (vin: string | null | undefined) => (vin || "").trim().toUpperCase();
  const storedVin = normalizeVin(vehicle?.vin);
  const capturedVin = normalizeVin(payload.capturedVin);
  const vinMatched = !storedVin || (capturedVin && storedVin === capturedVin);

  const allowedStatuses = ["scheduled", "assigned", "en_route", "arrived", "in_progress"];
  if (!allowedStatuses.includes(order.status)) {
    throw new Error("Work order must be scheduled or in-progress before completion.");
  }

  // 1. Progress state machine through valid transitions if needed
  let currentStatus = order.status;
  if (["assigned", "en_route", "arrived"].includes(currentStatus)) {
    await transitionFleetWorkOrderStatus({
      workOrderId: payload.workOrderId,
      targetStatus: "in_progress",
      actorRole: "provider",
      reasonCode: "manual_complete_flow",
    });
    currentStatus = "in_progress";
  }

  // 2. Perform target state transition to 'completed'
  await transitionFleetWorkOrderStatus({
    workOrderId: payload.workOrderId,
    targetStatus: "completed",
    actorRole: "provider",
    reasonCode: "manual_complete",
    details: { mileage_at_service: payload.mileageAtService, technician_notes: payload.technicianNotes },
  });

  // 3. Update the completion-specific details
  const updates: FleetWorkOrderUpdate = {
    mileage_at_service: payload.mileageAtService,
    completion_status: vinMatched ? "passed" : "vin_mismatch",
    completion_vin_captured: capturedVin || null,
    completion_vin_matched: vinMatched,
  };
  if (payload.technicianNotes) {
    updates.technician_notes = payload.technicianNotes;
  }

  const { error: updateError } = await supabase
    .from("fleet_work_orders")
    .update(updates)
    .eq("id", payload.workOrderId)
    .eq("user_id", user.id)
    .eq("status", "completed");

  if (updateError) {
    console.error("[completeFleetWorkOrderWithDetails] Error updating work order", updateError);
    throw new Error("Failed to persist completion details after status transition.");
  }

  if (order.fleet_vehicle_id) {
    await supabase
      .from("fleet_vehicles")
      .update({ mileage: payload.mileageAtService, vin: capturedVin || vehicle?.vin || null })
      .eq("id", order.fleet_vehicle_id);
  }
}

export async function authorizePurchaseOrderForWorkOrder(
  workOrderId: string,
  purchaseOrderId: string,
  options?: RuntimeIntegrityOptions,
): Promise<void> {
  const {
    data: { user },
  } = await getCurrentAuthUser();
  if (!user) throw new Error("You must be logged in to authorize POs.");

  const [{ data: order }, { data: po }, { data: orderLedger }] = await Promise.all([
    db.from("fleet_work_orders").select("id,total,status,fleet_client_id,fleet_vehicle_id,fleet_purchase_order_id").eq("id", workOrderId).eq("user_id", user.id).maybeSingle(),
    db.from("fleet_purchase_orders").select("id,po_number,status,amount_limit,amount_authorized,amount_consumed,amount_used,fleet_client_id,notes").eq("id", purchaseOrderId).eq("user_id", user.id).maybeSingle(),
    db.from("fleet_po_ledger_entries").select("entry_type,amount,fleet_purchase_order_id,reason_code").eq("fleet_work_order_id", workOrderId).eq("user_id", user.id),
  ]);

  if (!order || !po) throw new Error("Work order or purchase order not found");
  if (!["scheduled", "en_route", "arrived", "in_progress", "completed", "invoiced"].includes(String(order.status || ""))) {
    throw new Error("PO authorization is only allowed for active or billable work orders.");
  }
  if (order.fleet_purchase_order_id && order.fleet_purchase_order_id !== purchaseOrderId) {
    throw new Error("Work order is already linked to a different PO.");
  }
  if (order.fleet_client_id !== po.fleet_client_id) throw new Error("PO must match work order fleet account");
  if (!["open", "partially_used"].includes(po.status || "")) throw new Error("PO is not available for authorization");

  const alreadyAuthorizedForOrder = (orderLedger || [])
    .filter((entry) => entry.fleet_purchase_order_id === purchaseOrderId && entry.reason_code === "work_order_po_authorized")
    .reduce((acc: number, entry) => acc + Number(entry.amount || 0), 0);
  const targetAuthorization = Number(order.total || 0);
  const authorizationDelta = Math.max(0, targetAuthorization - alreadyAuthorizedForOrder);

  const policy = parsePoLedgerPolicy(po.notes);
  if (policy.maxPerJob && targetAuthorization > policy.maxPerJob) {
    throw new Error(`PO max-per-job limit exceeded (${policy.maxPerJob.toFixed(2)}).`);
  }
  if (policy.maxPerVehicle && order.fleet_vehicle_id && authorizationDelta > 0) {
    const { data: vehicleLedger } = await db
      .from("fleet_po_ledger_entries")
      .select("entry_type,amount")
      .eq("fleet_purchase_order_id", po.id)
      .eq("user_id", user.id)
      .contains("metadata", { vehicle_id: order.fleet_vehicle_id });
    const vehicleNet = computeLedgerNetForEntries((vehicleLedger || []) as Array<{ entry_type: string; amount: Dollars | null }>);
    if (vehicleNet.netReserved + authorizationDelta > policy.maxPerVehicle) {
      throw new Error(`PO max-per-vehicle limit exceeded (${policy.maxPerVehicle.toFixed(2)}).`);
    }
  }
  if (authorizationDelta > 0) {
    const projectedAuthorized = Number(po.amount_authorized || 0) + authorizationDelta;
    if (po.amount_limit !== null && po.amount_limit !== undefined && projectedAuthorized > Number(po.amount_limit)) {
      throw new Error("PO limit would be exceeded by this authorization");
    }

    await db
      .from("fleet_purchase_orders")
      .update({
        amount_authorized: projectedAuthorized,
        status: projectedAuthorized >= Number(po.amount_limit || 0) ? "partially_used" : po.status,
      })
      .eq("id", po.id)
      .eq("user_id", user.id);

    await db.from("fleet_po_ledger_entries").insert({
      user_id: user.id,
      fleet_purchase_order_id: purchaseOrderId,
      fleet_work_order_id: workOrderId,
      entry_type: "authorized",
      amount: authorizationDelta,
      reason_code: "work_order_po_authorized",
      metadata: { projected_authorized: projectedAuthorized, authorization_delta: authorizationDelta },
    });
  }

  await db.from("fleet_work_order_pos").upsert({
    fleet_work_order_id: workOrderId,
    fleet_purchase_order_id: purchaseOrderId,
    amount_applied: targetAuthorization,
  });

  await db
    .from("fleet_work_orders")
    .update({
      fleet_purchase_order_id: purchaseOrderId,
      po_number: po.po_number,
      po_authorization_status: "authorized",
    })
    .eq("id", workOrderId)
    .eq("user_id", user.id);
}

export async function applyFleetInvoiceAdjustment(input: {
  workOrderId: string;
  adjustedTotal: number;
  reason: string;
  integrity?: RuntimeIntegrityOptions | null;
  override?: RuntimeOverrideRequest | null;
}): Promise<void> {
  const {
    data: { user },
  } = await getCurrentAuthUser();
  if (!user) throw new Error("You must be logged in to adjust invoices.");
  if (!Number.isFinite(input.adjustedTotal) || input.adjustedTotal < 0) {
    throw new Error("Adjusted total must be a valid non-negative amount.");
  }
  if (!input.reason || !input.reason.trim()) {
    throw new Error("A reason is required for invoice adjustment.");
  }

  const { data: order } = await db
    .from("fleet_work_orders")
    .select("id,total,tax_amount,status,fleet_purchase_order_id,fleet_vehicle_id,parts_used")
    .eq("id", input.workOrderId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!order) throw new Error("Work order not found.");
  if (!["completed", "invoiced"].includes(String(order.status || ""))) {
    throw new Error("Invoice adjustment is only allowed for completed or invoiced work orders.");
  }

  if (order.fleet_purchase_order_id) {
    const [{ data: po }, { data: orderLedger }] = await Promise.all([
      supabase
        .from("fleet_purchase_orders")
        .select("id,amount_limit,amount_authorized,amount_consumed,amount_used,notes,status")
        .eq("id", order.fleet_purchase_order_id)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("fleet_po_ledger_entries")
        .select("entry_type,amount")
        .eq("fleet_work_order_id", input.workOrderId)
        .eq("user_id", user.id),
    ]);

    if (!po) throw new Error("Linked PO not found for adjustment.");
    const reservedForOrder = (orderLedger || [])
      .filter((entry) => entry.entry_type === "authorized")
      .reduce((acc: number, entry) => acc + Number(entry.amount || 0), 0);
    const releasedForOrder = (orderLedger || [])
      .filter((entry) => entry.entry_type === "released")
      .reduce((acc: number, entry) => acc + Number(entry.amount || 0), 0);
    const netReservedForOrder = reservedForOrder - releasedForOrder;

    const delta = input.adjustedTotal - netReservedForOrder;
    const poState = computePoRemaining(po);
    const policy = parsePoLedgerPolicy(po.notes);
    if (delta > 0 && delta > poState.remaining) {
      throw new Error("PO ledger limit exceeded by invoice adjustment.");
    }
    if (policy.maxPerJob && input.adjustedTotal > policy.maxPerJob) {
      throw new Error(`PO max-per-job limit exceeded (${policy.maxPerJob.toFixed(2)}).`);
    }

    if (delta !== 0) {
      await supabase
        .from("fleet_purchase_orders")
        .update({
          amount_authorized: Number(po.amount_authorized || 0) + delta,
        })
        .eq("id", po.id)
        .eq("user_id", user.id);

      await supabase.from("fleet_po_ledger_entries").insert({
        user_id: user.id,
        fleet_purchase_order_id: po.id,
        fleet_work_order_id: input.workOrderId,
        entry_type: delta > 0 ? "authorized" : "released",
        amount: Math.abs(delta),
        reason_code: "invoice_adjustment",
        metadata: {
          previous_total: Number(order.total || 0),
          adjusted_total: input.adjustedTotal,
          vehicle_id: order.fleet_vehicle_id,
        },
      });
    }

    await assertPoLedgerWithinLimits({
      userId: user.id,
      poId: order.fleet_purchase_order_id,
      workOrderId: input.workOrderId,
      vehicleId: order.fleet_vehicle_id,
      orderTotal: input.adjustedTotal,
      stage: "invoice",
    });
  }

  const existingTaxAmount = Number(order.tax_amount || 0);
  if (existingTaxAmount < 0) {
    throw new Error("Invalid tax context on work order.");
  }
  const adjustedSubtotal = input.adjustedTotal - existingTaxAmount;
  if (adjustedSubtotal < 0) {
    throw new Error("Adjusted total is below current tax amount, which is invalid.");
  }
  const normalizedAdjustedTotal = adjustedSubtotal + existingTaxAmount;
  const priorTotal = Number(order.total || 0);
  const absoluteDelta = Math.abs(normalizedAdjustedTotal - priorTotal);
  const requiresExceptionOverride = priorTotal > 0 && absoluteDelta / priorTotal > 0.25;
  if (requiresExceptionOverride) {
    if (!input.override) {
      throw new Error("Adjustment above 25% requires an approved override chain.");
    }
    assertRuntimeOverrideGovernance({
      request: input.override,
      actorRole: "provider",
    });
    if (input.override.action !== "invoice_adjustment_exception") {
      throw new Error("Invoice adjustment override must use action 'invoice_adjustment_exception'.");
    }
    await db.from("fleet_activity_logs").insert({
      fleet_work_order_id: input.workOrderId,
      user_id: user.id,
      action: "runtime_override_approved",
      actor_role: "provider",
      details: {
        override_action: input.override.action,
        reason_code: input.override.reasonCode,
        note: input.override.note || null,
        approval_chain: input.override.approvalChain || [],
        prior_total: priorTotal,
        adjusted_total: normalizedAdjustedTotal,
      } as unknown as Database["public"]["Tables"]["fleet_activity_logs"]["Insert"]["details"],
    });
  }

  if (order.fleet_purchase_order_id) {
    const [{ data: po }, { data: orderLedger }] = await Promise.all([
      supabase
        .from("fleet_purchase_orders")
        .select("id,amount_limit,amount_authorized,amount_consumed,amount_used,notes,status")
        .eq("id", order.fleet_purchase_order_id)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("fleet_po_ledger_entries")
        .select("entry_type,amount")
        .eq("fleet_work_order_id", input.workOrderId)
        .eq("user_id", user.id),
    ]);

    if (!po) throw new Error("Linked PO not found for adjustment.");
    const reservedForOrder = (orderLedger || [])
      .filter((entry) => entry.entry_type === "authorized")
      .reduce((acc: number, entry) => acc + Number(entry.amount || 0), 0);
    const releasedForOrder = (orderLedger || [])
      .filter((entry) => entry.entry_type === "released")
      .reduce((acc: number, entry) => acc + Number(entry.amount || 0), 0);
    const netReservedForOrder = reservedForOrder - releasedForOrder;

    const delta = normalizedAdjustedTotal - netReservedForOrder;
    const poState = computePoRemaining(po);
    const policy = parsePoLedgerPolicy(po.notes);
    if (delta > 0 && delta > poState.remaining) {
      throw new Error("PO ledger limit exceeded by invoice adjustment.");
    }
    if (policy.maxPerJob && normalizedAdjustedTotal > policy.maxPerJob) {
      throw new Error(`PO max-per-job limit exceeded (${policy.maxPerJob.toFixed(2)}).`);
    }

    if (delta !== 0) {
      await supabase
        .from("fleet_purchase_orders")
        .update({
          amount_authorized: Number(po.amount_authorized || 0) + delta,
        })
        .eq("id", po.id)
        .eq("user_id", user.id);

      await supabase.from("fleet_po_ledger_entries").insert({
        user_id: user.id,
        fleet_purchase_order_id: po.id,
        fleet_work_order_id: input.workOrderId,
        entry_type: delta > 0 ? "authorized" : "released",
        amount: Math.abs(delta),
        reason_code: "invoice_adjustment",
        metadata: {
          previous_total: Number(order.total || 0),
          adjusted_total: normalizedAdjustedTotal,
          vehicle_id: order.fleet_vehicle_id,
        },
      });
    }

    await assertPoLedgerWithinLimits({
      userId: user.id,
      poId: order.fleet_purchase_order_id,
      workOrderId: input.workOrderId,
      vehicleId: order.fleet_vehicle_id,
      orderTotal: normalizedAdjustedTotal,
      stage: "invoice",
    });
  }

  let workOrderUpdate = db
    .from("fleet_work_orders")
    .update({
      total: normalizedAdjustedTotal,
      subtotal: adjustedSubtotal,
    })
    .eq("id", input.workOrderId)
    .eq("user_id", user.id);
  if (input.integrity?.expectedUpdatedAt) {
    workOrderUpdate = workOrderUpdate.eq("updated_at", input.integrity.expectedUpdatedAt);
  }
  await workOrderUpdate;

  await db.from("fleet_activity_logs").insert({
    fleet_work_order_id: input.workOrderId,
    user_id: user.id,
    action: "invoice_adjusted",
    actor_role: "provider",
    details: {
      previous_total: Number(order.total || 0),
      adjusted_total: normalizedAdjustedTotal,
      reason: input.reason,
    },
  });
}

export async function recordFleetInvoicePayment(input: {
  workOrderId: string;
  amount: Dollars;
  paymentMethod?: string | null;
  reference?: string | null;
  notes?: string | null;
  integrity?: RuntimeIntegrityOptions | null;
}): Promise<void> {
  const {
    data: { user },
  } = await getCurrentAuthUser();
  if (!user) throw new Error("You must be logged in to record invoice payments.");
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }
  const operationLock = await acquireOperationLock({
    userId: user.id,
    operationType: "invoice_payment_post",
    idempotencyKey: resolveIntegrityIdempotencyKey(
      [user.id, input.workOrderId, Number(input.amount).toFixed(2), input.paymentMethod || "manual", input.reference || ""],
      input.integrity,
    ),
    context: {
      work_order_id: input.workOrderId,
      amount: input.amount,
      payment_method: input.paymentMethod || "manual",
      reference: input.reference || null,
    },
  });
  if (operationLock.duplicateCompleted) return;
  try {

  const { data: order } = await supabase
    .from("fleet_work_orders")
    .select("id,total,subtotal,tax_amount,status,updated_at,parts_used,fleet_purchase_order_id,fleet_vehicle_id")
    .eq("id", input.workOrderId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!order) throw new Error("Work order not found.");
  assertOptimisticWorkOrderGuard(order, input.integrity);
  if (!["invoiced"].includes(String(order.status || ""))) {
    throw new Error("Payments can only be recorded for invoiced work orders.");
  }
  // Validate financial totals consistency
  const subtotalVal = Number(order.subtotal || 0);
  const taxVal = Number(order.tax_amount || 0);
  const totalVal = Number(order.total || 0);
  if (subtotalVal + taxVal > 0 && Math.abs((subtotalVal + taxVal) - totalVal) > 0.02) {
    throw new Error("Financial totals are inconsistent (subtotal + tax ≠ total). Correct the invoice before recording payment.");
  }
  if (Number(order.total || 0) <= 0) {
    throw new Error("Cannot record payment for a zero-value invoice.");
  }

  if (order.fleet_purchase_order_id) {
    const [{ data: po }, { data: ledger }] = await Promise.all([
      supabase
        .from("fleet_purchase_orders")
        .select("id,amount_consumed,amount_used")
        .eq("id", order.fleet_purchase_order_id)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("fleet_po_ledger_entries")
        .select("entry_type,amount")
        .eq("fleet_work_order_id", input.workOrderId)
        .eq("user_id", user.id),
    ]);
    if (!po) throw new Error("Linked PO not found for payment.");

    const reserved = (ledger || [])
      .filter((entry) => entry.entry_type === "authorized")
      .reduce((acc: number, entry) => acc + Number(entry.amount || 0), 0);
    const released = (ledger || [])
      .filter((entry) => entry.entry_type === "released")
      .reduce((acc: number, entry) => acc + Number(entry.amount || 0), 0);
    const consumed = (ledger || [])
      .filter((entry) => entry.entry_type === "consumed")
      .reduce((acc: number, entry) => acc + Number(entry.amount || 0), 0);
    const availableToConsume = Math.max(0, reserved - released - consumed);
    if (consumed + input.amount > Number(order.total || 0)) {
      throw new Error("Payment would exceed the invoiced work order total.");
    }
    if (input.amount > availableToConsume) {
      throw new Error("Payment exceeds reserved PO authorization for this work order.");
    }

    await supabase
      .from("fleet_purchase_orders")
      .update({
        amount_consumed: Number(po.amount_consumed || 0) + input.amount,
        amount_used: Number(po.amount_used || 0) + input.amount,
      })
      .eq("id", po.id)
      .eq("user_id", user.id);

    await supabase.from("fleet_po_ledger_entries").insert({
      user_id: user.id,
      fleet_purchase_order_id: po.id,
      fleet_work_order_id: input.workOrderId,
      entry_type: "consumed",
      amount: input.amount,
      reason_code: "invoice_payment_recorded",
      metadata: {
        vehicle_id: order.fleet_vehicle_id,
        payment_method: input.paymentMethod || "manual",
      },
    });
  }

  const { error: rpcError } = await db.rpc("record_fleet_invoice_payment", {
    p_work_order_id: input.workOrderId,
    p_amount: input.amount,
    p_payment_method: input.paymentMethod || "manual",
    p_reference: input.reference || null,
    p_notes: input.notes || null,
  });
  if (rpcError) throw new Error(rpcError.message || "Failed to record invoice payment.");

  const { data: refreshedOrder } = await supabase
    .from("fleet_work_orders")
    .select("invoice_paid_amount,total")
    .eq("id", input.workOrderId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (
    refreshedOrder &&
    Number(refreshedOrder.invoice_paid_amount || 0) - Number(refreshedOrder.total || 0) > 0.01
  ) {
    throw new Error("Payment posting exceeded invoice total; transaction rejected for reconciliation.");
  }
    await finalizeOperationLock({ userId: user.id, batchId: operationLock.batchId });
  } catch (lockError) {
    await finalizeOperationLock({
      userId: user.id,
      batchId: operationLock.batchId,
      failed: true,
      errorMessage: lockError instanceof Error ? lockError.message : "payment post failed",
    });
    throw lockError;
  }
}

export interface FleetWorkOrderApprovalPayload {
  workOrderId: string;
  title: string;
  description?: string | null;
  estimatedCost?: number | null;
}

export async function requestFleetWorkOrderApproval(
  payload: FleetWorkOrderApprovalPayload,
): Promise<void> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) {
    throw new Error("You must be logged in to request approvals.");
  }

  const approvalInsert: FleetApprovalInsert = {
    fleet_work_order_id: payload.workOrderId,
    user_id: user.id,
    requested_by: "provider",
    approval_type: "additional_repair",
    title: payload.title,
    description: payload.description || null,
    estimated_cost: payload.estimatedCost ?? null,
  };

  const { error } = await supabase.from("fleet_approvals").insert(approvalInsert);

  if (error) {
    console.error("[requestFleetWorkOrderApproval] Error creating approval", error);
    throw new Error("Failed to request approval");
  }

  await supabase
    .from("fleet_work_orders")
    .update({ approval_required: true })
    .eq("id", payload.workOrderId)
    .eq("user_id", user.id);

  await supabase.from("fleet_activity_logs").insert({
    fleet_work_order_id: payload.workOrderId,
    user_id: user.id,
    action: "approval_requested",
    actor_role: "provider",
    details: {
      message: payload.title,
      amount: payload.estimatedCost ?? undefined,
    },
  });
}

export interface AddFleetWorkOrderLineItemPayload {
  workOrderId: string;
  lineType: string;
  description: string;
  quantity: number;
  unitPrice: Dollars;
  serviceCatalogId?: string | null;
  fleetContractServiceId?: string | null;
  priceSource?: "contract" | "catalog" | "manual";
}

export async function addFleetWorkOrderLineItem(
  payload: AddFleetWorkOrderLineItemPayload,
): Promise<void> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) {
    throw new Error("You must be logged in to edit line items.");
  }
  const status = await getFleetWorkOrderStatusForUser(payload.workOrderId, user.id);
  assertFleetWorkOrderEditableForAction(status, "restricted");

  const { data: existingItems } = await supabase
    .from("fleet_work_order_line_items")
    .select("id")
    .eq("fleet_work_order_id", payload.workOrderId)
    .eq("user_id", user.id)
    .order("sort_order");

  const sortOrder = (existingItems?.length ?? 0);

  const total = toDollars(payload.quantity * payload.unitPrice);

  const lineItemInsert: FleetWorkOrderLineItemInsert = {
    fleet_work_order_id: payload.workOrderId,
    user_id: user.id,
    line_type: payload.lineType,
    description: payload.description,
    quantity: payload.quantity,
    unit_price: payload.unitPrice,
    total,
    sort_order: sortOrder,
    service_catalog_id: payload.serviceCatalogId ?? null,
    fleet_contract_service_id: payload.fleetContractServiceId ?? null,
    price_source: payload.priceSource || "manual",
  };

  const { error } = await supabase.from("fleet_work_order_line_items").insert(lineItemInsert);

  if (error) {
    console.error("[addFleetWorkOrderLineItem] Error inserting line item", error);
    throw new Error("Failed to add line item");
  }

  const [{ data: lines }, { data: order }] = await Promise.all([
    supabase
      .from("fleet_work_order_line_items")
      .select("total")
      .eq("fleet_work_order_id", payload.workOrderId)
      .eq("user_id", user.id),
    supabase
      .from("fleet_work_orders")
      .select("tax_amount")
      .eq("id", payload.workOrderId)
      .eq("user_id", user.id)
      .single(),
  ]);

  const subtotal =
    (lines as { total: Dollars | null }[] | null)?.reduce(
      (sum, li) => toDollars(sum + (li.total || 0)),
      toDollars(0),
    ) ?? toDollars(0);
  const taxAmount = order?.tax_amount || 0;

  await supabase
    .from("fleet_work_orders")
    .update({ subtotal, total: subtotal + taxAmount })
    .eq("id", payload.workOrderId)
    .eq("user_id", user.id);
}

export async function deleteFleetWorkOrderLineItem(
  workOrderId: string,
  lineItemId: string,
): Promise<void> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) {
    throw new Error("You must be logged in to edit line items.");
  }
  const status = await getFleetWorkOrderStatusForUser(workOrderId, user.id);
  assertFleetWorkOrderEditableForAction(status, "restricted");

  await supabase
    .from("fleet_work_order_line_items")
    .delete()
    .eq("id", lineItemId)
    .eq("fleet_work_order_id", workOrderId)
    .eq("user_id", user.id);

  const [{ data: lines }, { data: order }] = await Promise.all([
    supabase
      .from("fleet_work_order_line_items")
      .select("total")
      .eq("fleet_work_order_id", workOrderId)
      .eq("user_id", user.id),
    supabase
      .from("fleet_work_orders")
      .select("tax_amount")
      .eq("id", workOrderId)
      .eq("user_id", user.id)
      .single(),
  ]);

  const subtotal =
    (lines as { total: Dollars | null }[] | null)?.reduce(
      (sum, li) => toDollars(sum + (li.total || 0)),
      toDollars(0),
    ) ?? toDollars(0);
  const taxAmount = order?.tax_amount || 0;

  await supabase
    .from("fleet_work_orders")
    .update({ subtotal, total: subtotal + taxAmount })
    .eq("id", workOrderId)
    .eq("user_id", user.id);
}

export interface UpdateFleetWorkOrderLineItemPayload {
  workOrderId: string;
  lineItemId: string;
  description: string;
  quantity: number;
  unitPrice: Dollars;
}

type FleetWorkOrderEditableStatus =
  | "draft"
  | "scheduled"
  | "assigned"
  | "in_progress"
  | "completed"
  | "invoiced";

async function getFleetWorkOrderStatusForUser(workOrderId: string, userId: string): Promise<FleetWorkOrderEditableStatus | string> {
  const { data, error } = await supabase
    .from("fleet_work_orders")
    .select("status")
    .eq("id", workOrderId)
    .eq("user_id", userId)
    .single();
  if (error || !data) throw new Error("Work order not found");
  return data.status;
}

function assertFleetWorkOrderEditableForAction(
  status: string,
  action: "full" | "limited" | "restricted",
): void {
  const full = status === "draft" || status === "pending_review";
  const limited = status === "scheduled" || status === "assigned";
  const restricted = status === "in_progress";
  const locked = status === "completed" || status === "invoiced";

  if (locked) throw new Error("Work order is locked at this lifecycle stage.");
  if (action === "full" && !full) throw new Error("This action is only allowed in draft status.");
  if (action === "limited" && !(full || limited)) throw new Error("This action is not allowed for current status.");
  if (action === "restricted" && !(full || limited || restricted)) {
    throw new Error("This action is not allowed for current status.");
  }
}

export async function updateFleetWorkOrderLineItem(
  payload: UpdateFleetWorkOrderLineItemPayload,
): Promise<void> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) {
    throw new Error("You must be logged in to edit line items.");
  }
  const status = await getFleetWorkOrderStatusForUser(payload.workOrderId, user.id);
  assertFleetWorkOrderEditableForAction(status, "restricted");

  const total = toDollars(payload.quantity * payload.unitPrice);
  const { error } = await supabase
    .from("fleet_work_order_line_items")
    .update({
      description: payload.description,
      quantity: payload.quantity,
      unit_price: payload.unitPrice,
      total,
    })
    .eq("id", payload.lineItemId)
    .eq("fleet_work_order_id", payload.workOrderId)
    .eq("user_id", user.id);

  if (error) {
    console.error("[updateFleetWorkOrderLineItem] Error updating line item", error);
    throw new Error("Failed to update line item");
  }

  const [{ data: lines }, { data: order }] = await Promise.all([
    supabase
      .from("fleet_work_order_line_items")
      .select("total")
      .eq("fleet_work_order_id", payload.workOrderId)
      .eq("user_id", user.id),
    supabase
      .from("fleet_work_orders")
      .select("tax_amount")
      .eq("id", payload.workOrderId)
      .eq("user_id", user.id)
      .single(),
  ]);

  const subtotal =
    (lines as { total: Dollars | null }[] | null)?.reduce(
      (sum, li) => toDollars(sum + (li.total || 0)),
      toDollars(0),
    ) ?? toDollars(0);
  const taxAmount = order?.tax_amount || 0;

  await supabase
    .from("fleet_work_orders")
    .update({ subtotal, total: subtotal + taxAmount })
    .eq("id", payload.workOrderId)
    .eq("user_id", user.id);
}

export async function updateFleetWorkOrderNotes(workOrderId: string, notes: string | null): Promise<void> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) {
    throw new Error("You must be logged in to edit notes.");
  }
  const status = await getFleetWorkOrderStatusForUser(workOrderId, user.id);
  assertFleetWorkOrderEditableForAction(status, "restricted");

  const { error } = await supabase
    .from("fleet_work_orders")
    .update({ notes })
    .eq("id", workOrderId)
    .eq("user_id", user.id);

  if (error) {
    console.error("[updateFleetWorkOrderNotes] Error updating notes", error);
    throw new Error("Failed to update notes");
  }
}

export async function linkFleetWorkOrderToAppointment(workOrderId: string, appointmentId: string): Promise<void> {
  void workOrderId;
  void appointmentId;
  throw new Error("Linking Fleet work orders to retail appointments is disabled. Fleet scheduling is Fleet-native.");
}

export async function createAppointmentFromFleetWorkOrder(workOrderId: string): Promise<string> {
  void workOrderId;
  throw new Error("Creating retail appointments from Fleet work orders is disabled. Use Fleet Scheduler in Fleet OS.");
}

export async function updateFleetWorkOrderSchedule(
  workOrderId: string,
  payload: { scheduledDate: string; scheduledTime: string | null },
): Promise<void> {
  const {
    data: { user },
  } = await getCurrentAuthUser();
  if (!user) throw new Error("You must be logged in to edit work orders.");
  const status = await getFleetWorkOrderStatusForUser(workOrderId, user.id);
  assertFleetWorkOrderEditableForAction(status, "limited");

  const { data: existingSchedule } = await supabase
    .from("fleet_work_orders")
    .select("scheduled_date,scheduled_time,updated_at")
    .eq("id", workOrderId)
    .eq("user_id", user.id)
    .maybeSingle();

  // Conflict-safe rescheduling requires a start time. When the dispatcher leaves the
  // time blank (date-only move), keep the existing start time, or fall back to 08:00.
  const resolvedTime =
    payload.scheduledTime || existingSchedule?.scheduled_time || "08:00:00";

  if (!existingSchedule) {
    throw new Error("Work order schedule was not found.");
  }

  const { error } = await supabase.rpc("reschedule_fleet_work_order_v1", {
    p_work_order_id: workOrderId,
    p_date: payload.scheduledDate,
    p_start: resolvedTime,
    p_expected_updated_at: existingSchedule.updated_at,
  });
  if (error) throw new Error("Failed to update schedule");

  await supabase.from("fleet_activity_logs").insert({
    fleet_work_order_id: workOrderId,
    user_id: user.id,
    action: "scheduler_updated",
    actor_role: "provider",
    details: {
      previous_scheduled_date: existingSchedule?.scheduled_date ?? null,
      previous_scheduled_time: existingSchedule?.scheduled_time ?? null,
      scheduled_date: payload.scheduledDate,
      scheduled_time: resolvedTime,
    },
  });
}

export async function runFleetSchedulerReconciliation(): Promise<{
  missingScheduleCount: number;
  missingScheduleWorkOrderIds: string[];
}> {
  const {
    data: { user },
  } = await getCurrentAuthUser();
  if (!user) throw new Error("You must be logged in to run reconciliation.");

  const schedulerStatuses = ["scheduled", "assigned", "in_progress"];
  const { data, error } = await supabase
    .from("fleet_work_orders")
    .select("id")
    .eq("user_id", user.id)
    .in("status", schedulerStatuses)
    .is("scheduled_date", null)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("Failed to run scheduler reconciliation");

  return {
    missingScheduleCount: data?.length ?? 0,
    missingScheduleWorkOrderIds: (data ?? []).map((row) => String(row.id)),
  };
}

export async function updateFleetWorkOrderDetails(
  workOrderId: string,
  payload: { serviceType: string | null; description: string | null },
): Promise<void> {
  const {
    data: { user },
  } = await getCurrentAuthUser();
  if (!user) throw new Error("You must be logged in to edit work orders.");
  const status = await getFleetWorkOrderStatusForUser(workOrderId, user.id);
  assertFleetWorkOrderEditableForAction(status, "limited");

  const { error } = await supabase
    .from("fleet_work_orders")
    .update({ service_type: payload.serviceType, description: payload.description })
    .eq("id", workOrderId)
    .eq("user_id", user.id);
  if (error) throw new Error("Failed to update work order");
}


/**
 * Update an existing fleet vehicle.
 */
export async function updateFleetVehicle(
  vehicleId: string,
  payload: Partial<CreateFleetVehiclePayload>,
): Promise<void> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) {
    throw new Error("You must be logged in to update fleet vehicles.");
  }

  const { error } = await supabase
    .from("fleet_vehicles")
    .update(payload)
    .eq("id", vehicleId)
    .eq("user_id", user.id);

  if (error) {
    console.error("[updateFleetVehicle] Error updating fleet vehicle", error);
    throw new Error("Failed to update fleet vehicle");
  }

  // VIN/YMM/engine changes invalidate the old fitment snapshot. Resolve from the
  // saved canonical vehicle and refresh every active job without disturbing its
  // other parts_used context.
  if (["vin", "year", "make", "model", "engine"].some((field) => field in payload)) {
    try {
      const { data: vehicle } = await supabase
        .from("fleet_vehicles")
        .select("id,vin,year,make,model,engine")
        .eq("id", vehicleId)
        .eq("user_id", user.id)
        .single();
      if (vehicle?.year && vehicle.make && vehicle.model) {
        const filters = await resolveVehicleFilters({
          year: vehicle.year,
          make: vehicle.make,
          model: vehicle.model,
          engine: vehicle.engine,
          vehicleKind: "fleet",
          vehicleId,
        });
        const filterMatch = {
          status: filters.length > 0 ? "resolved" : "no_match",
          resolved_at: new Date().toISOString(),
          vehicle: {
            id: vehicle.id,
            vin: vehicle.vin,
            year: vehicle.year,
            make: vehicle.make,
            model: vehicle.model,
            engine: vehicle.engine,
          },
          filters: filters.map((filter) => ({
            part_category: filter.part_category,
            brand: filter.brand,
            part_number: filter.part_number,
            quantity: filter.quantity,
            source: filter.source,
          })),
        };
        const { data: activeOrders } = await supabase
          .from("fleet_work_orders")
          .select("id,parts_used")
          .eq("fleet_vehicle_id", vehicleId)
          .eq("user_id", user.id)
          .in("status", ["draft", "pending_review", "scheduled", "assigned", "in_progress"]);
        await Promise.all((activeOrders ?? []).map((order) => {
          const current = order.parts_used && typeof order.parts_used === "object" && !Array.isArray(order.parts_used)
            ? order.parts_used as Record<string, unknown>
            : {};
          return supabase
            .from("fleet_work_orders")
            .update({
              parts_used: { ...current, vehicle_filter_match: filterMatch } as Database["public"]["Tables"]["fleet_work_orders"]["Update"]["parts_used"],
            })
            .eq("id", order.id)
            .eq("user_id", user.id);
        }));
      }
    } catch (contextError) {
      // Vehicle edits remain available if reference lookup is temporarily down;
      // the work-order UI will show its explicit unavailable/no-match state.
      console.warn("[updateFleetVehicle] Could not refresh filter job context", contextError);
    }
  }
}

/**
 * Delete a fleet vehicle.
 */
export async function deleteFleetVehicle(vehicleId: string): Promise<void> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) {
    throw new Error("You must be logged in to delete fleet vehicles.");
  }

  const { error } = await supabase
    .from("fleet_vehicles")
    .delete()
    .eq("id", vehicleId)
    .eq("user_id", user.id);

  if (error) {
    console.error("[deleteFleetVehicle] Error deleting fleet vehicle", error);
    throw new Error("Failed to delete fleet vehicle");
  }
}

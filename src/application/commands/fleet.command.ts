import { apiClient, ApiClientError } from "@/lib/api-client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";

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

export interface RuntimeOverrideRequest {
  action: "completion_gate" | "status_transition_exception" | "po_policy_exception" | "invoice_adjustment_exception";
  reasonCode:
    | "vin_mismatch"
    | "location_window_exception"
    | "contract_rule_exception"
    | "service_package_missing"
    | "service_profile_missing"
    | "po_limit_exception"
    | "invoice_delta_exception"
    | "other";
  note?: string | null;
  approvalChain?: Array<{ approverUserId: string; approverRole: string; approvedAt: string }>;
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
    const { data } = await apiClient.post<{
      data: {
        payment_intent_id?: string;
        payment_record_id?: string;
        status?: string;
        settled?: boolean;
        duplicate?: boolean;
      };
    }>("/v1/fleet/work-orders/charge", { request });

    return {
      success: true,
      paymentIntentId: data.payment_intent_id,
      paymentRecordId: data.payment_record_id,
      status: data.status,
      settled: data.settled ?? data.status === "succeeded",
      duplicate: data.duplicate ?? false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error processing fleet charge.";
    return {
      success: false,
      error: {
        code: err instanceof ApiClientError ? "edge_function_error" : "network_error",
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

  await apiClient.post("/v1/vans", { payload });
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

  const { data } = await apiClient.post<{ data: { id: string } }>("/v1/fleet/vehicles", { payload });
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

  // Input validation runs server-side with the vehicle's resolved client linkage.

  const { data } = await apiClient.post<{ data: { id: string; orderNumber: string | null } }>(
    "/v1/fleet/work-orders",
    { payload },
  );
  return { id: data.id, orderNumber: data.orderNumber ?? null };
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

  const { data } = await apiClient.post<{ data: GenerateWorkOrdersFromSchedulesResult }>(
    "/v1/fleet/work-orders/generate-from-schedules",
    { limit },
  );
  return data;
}

export async function getFleetDispatchScoreBreakdown(workOrderId: string): Promise<DispatchScoreBreakdown[]> {
  const {
    data: { user },
  } = await getCurrentAuthUser();
  if (!user) throw new Error("You must be logged in to score dispatch assignments.");

  const { data } = await apiClient.get<{ data: DispatchScoreBreakdown[] }>(
    `/v1/fleet/work-orders/${workOrderId}/dispatch-score`,
  );
  return data ?? [];
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

  await apiClient.post(`/v1/fleet/work-orders/${workOrderId}/advance`, { options: options ?? null });
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

  await apiClient.post(`/v1/fleet/work-orders/${payload.workOrderId}/complete`, { payload });
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

  await apiClient.post(`/v1/fleet/work-orders/${workOrderId}/authorize-po`, {
    purchase_order_id: purchaseOrderId,
    options: options ?? null,
  });
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

  await apiClient.post(`/v1/fleet/work-orders/${input.workOrderId}/invoice-adjustment`, { input });
}

export async function recordFleetInvoicePayment(input: {
  workOrderId: string;
  amount: number;
  paymentMethod?: string | null;
  reference?: string | null;
  notes?: string | null;
  integrity?: RuntimeIntegrityOptions | null;
}): Promise<void> {
  const {
    data: { user },
  } = await getCurrentAuthUser();
  if (!user) throw new Error("You must be logged in to record invoice payments.");

  await apiClient.post(`/v1/fleet/work-orders/${input.workOrderId}/invoice-payment`, { input });
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

  await apiClient.post(`/v1/fleet/work-orders/${payload.workOrderId}/approval`, { payload });
}

export interface AddFleetWorkOrderLineItemPayload {
  workOrderId: string;
  lineType: string;
  description: string;
  quantity: number;
  unitPrice: number;
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

  await apiClient.post(`/v1/fleet/work-orders/${payload.workOrderId}/line-items`, { payload });
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

  await apiClient.delete(`/v1/fleet/work-orders/${workOrderId}/line-items/${lineItemId}`);
}

export interface UpdateFleetWorkOrderLineItemPayload {
  workOrderId: string;
  lineItemId: string;
  description: string;
  quantity: number;
  unitPrice: number;
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

  await apiClient.patch(`/v1/fleet/work-orders/${payload.workOrderId}/line-items/${payload.lineItemId}`, {
    payload,
  });
}

export async function updateFleetWorkOrderNotes(workOrderId: string, notes: string | null): Promise<void> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) {
    throw new Error("You must be logged in to edit notes.");
  }

  await apiClient.patch(`/v1/fleet/work-orders/${workOrderId}/notes`, { notes });
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

  await apiClient.post(`/v1/fleet/work-orders/${workOrderId}/reschedule`, { payload });
}

export async function runFleetSchedulerReconciliation(): Promise<{
  missingScheduleCount: number;
  missingScheduleWorkOrderIds: string[];
}> {
  const {
    data: { user },
  } = await getCurrentAuthUser();
  if (!user) throw new Error("You must be logged in to run reconciliation.");

  const { data } = await apiClient.get<{
    data: { missingScheduleCount: number; missingScheduleWorkOrderIds: string[] };
  }>("/v1/fleet/scheduler-reconciliation");
  return data;
}

export async function updateFleetWorkOrderDetails(
  workOrderId: string,
  payload: { serviceType: string | null; description: string | null },
): Promise<void> {
  const {
    data: { user },
  } = await getCurrentAuthUser();
  if (!user) throw new Error("You must be logged in to edit work orders.");

  await apiClient.patch(`/v1/fleet/work-orders/${workOrderId}/details`, { payload });
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

  await apiClient.patch(`/v1/fleet/vehicles/${vehicleId}`, { payload });
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

  await apiClient.delete(`/v1/fleet/vehicles/${vehicleId}`);
}

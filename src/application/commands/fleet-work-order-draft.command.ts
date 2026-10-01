/**
 * Fleet Work Order Draft Command
 *
 * Draft-based, controlled work order creation. Drafts progress:
 *   draft → validated → approved → scheduled → in_progress → completed → closed
 */

import { apiClient } from "@/lib/api-client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export type WorkOrderDraftStatus =
  | "draft"
  | "validated"
  | "approved"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "closed"
  | "expired"
  | "canceled";

export type WorkOrderSourceType =
  | "manual"
  | "email"
  | "contract"
  | "pm_automation"
  | "customer_portal"
  | "ai_agent"
  | "import"
  | "recurring";

export interface DraftVehicleRef {
  id: string;
  unit_number?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  vin?: string | null;
  eligibility?: {
    reason?: string | null;
    severity?: "low" | "medium" | "high" | null;
  } | null;
}

export interface DraftServicePackage {
  code: string;
  label: string;
  base_price_per_vehicle: number;
  estimated_duration_minutes: number;
  includes: string[];
  oil_spec?: string | null;
  oil_capacity_quarts?: number | null;
  base_labor_service_package?: string | null;
}

export interface DraftAddOn {
  vehicle_id: string;
  code: string;
  label: string;
  price: number;
}

export interface WorkOrderDraftPayload {
  customer_id: string | null;
  location_id: string | null;
  contract_id: string | null;
  selected_vehicles: DraftVehicleRef[];
  service_package: DraftServicePackage | null;
  add_ons: DraftAddOn[];
  scheduled_date: string | null;
  scheduled_time: string | null;
  technician_id: string | null;
  po_number: string | null;
  billing_method: string | null;
  notes: string | null;
  estimated_subtotal: number;
  estimated_discount: number;
  estimated_tax: number;
  estimated_total: number;
  source_type: WorkOrderSourceType;
  created_from?: string | null;
  status?: WorkOrderDraftStatus;
}

export interface WorkOrderDraftRecord extends WorkOrderDraftPayload {
  id: string;
  user_id: string;
  created_by: string;
  status: WorkOrderDraftStatus;
  created_at?: string;
  updated_at?: string;
}

async function requireUserId(): Promise<string> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("You must be signed in.");
  return user.id;
}

export async function createDraft(payload: WorkOrderDraftPayload): Promise<{ id: string }> {
  await requireUserId();
  const { data } = await apiClient.post<{ data: { id: string } }>("/v1/fleet/work-order-drafts", { payload });
  return data;
}

export async function updateDraft(id: string, patch: Partial<WorkOrderDraftPayload>): Promise<void> {
  await apiClient.patch(`/v1/fleet/work-order-drafts/${id}`, { patch });
}

export async function deleteDraft(id: string): Promise<void> {
  await apiClient.delete(`/v1/fleet/work-order-drafts/${id}`);
}

export async function fetchDraft(id: string): Promise<WorkOrderDraftRecord | null> {
  const { data } = await apiClient.get<{ data: WorkOrderDraftRecord | null }>(
    `/v1/fleet/work-order-drafts/${id}`,
  );
  return data ?? null;
}

// ---------- Server-authoritative helpers (Sprint 2) ----------

export interface ServerValidationEntry {
  key: string;
  validation_type: string;
  passed: boolean;
  blocking: boolean;
  severity: string;
  message: string;
}

export async function validateDraftOnServer(draftId: string): Promise<ServerValidationEntry[]> {
  const { data } = await apiClient.post<{ data: ServerValidationEntry[] }>(
    `/v1/fleet/work-order-drafts/${draftId}/validate`,
  );
  return data ?? [];
}

export interface DraftPricingResult {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  base_price_per_vehicle: number;
  vehicle_count: number;
  contract_override_applied: boolean;
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function resolveDraftPricing(draftId: string): Promise<DraftPricingResult> {
  const { data } = await apiClient.post<{ data: unknown }>(
    `/v1/fleet/work-order-drafts/${draftId}/pricing`,
  );
  const result = jsonRecord(data);
  return {
    subtotal: typeof result.subtotal === "number" ? result.subtotal : 0,
    discount: typeof result.discount === "number" ? result.discount : 0,
    tax: typeof result.tax === "number" ? result.tax : 0,
    total: typeof result.total === "number" ? result.total : 0,
    base_price_per_vehicle: typeof result.base_price_per_vehicle === "number" ? result.base_price_per_vehicle : 0,
    vehicle_count: typeof result.vehicle_count === "number" ? result.vehicle_count : 0,
    contract_override_applied: result.contract_override_applied === true,
  };
}

export async function approveDraft(draftId: string): Promise<void> {
  await apiClient.post(`/v1/fleet/work-order-drafts/${draftId}/approve`);
}

/**
 * Promote a validated draft into one work order per selected vehicle,
 * using the existing createFleetWorkOrder pipeline. Requires the draft
 * to already be in `approved` status — callers should invoke `approveDraft`
 * first so server-side validation and PO enforcement run.
 */
export async function promoteDraft(
  draftId: string,
  opts: { onProgress?: (done: number, total: number) => void; autoApprove?: boolean } = {},
): Promise<{ createdIds: string[] }> {
  const { data } = await apiClient.post<{ data: { createdIds: string[] } }>(
    `/v1/fleet/work-order-drafts/${draftId}/promote`,
    { auto_approve: opts.autoApprove ?? null },
  );
  opts.onProgress?.(data.createdIds.length, data.createdIds.length);
  return { createdIds: data.createdIds };
}

/**
 * Fleet Work Order Draft Command
 *
 * Draft-based, controlled work order creation. Drafts progress:
 *   draft → validated → approved → scheduled → in_progress → completed → closed
 */

import { supabase } from "@/integrations/supabase/client";

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

async function requireUserId(): Promise<string> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("You must be signed in.");
  return user.id;
}

async function requireWorkspaceOwnerId(): Promise<string> {
  await requireUserId();
  const { data, error } = await (supabase as any).rpc("current_workspace_owner_user_id");
  if (error || !data) throw error ?? new Error("No active Fleet workspace.");
  return String(data);
}

export async function createDraft(payload: WorkOrderDraftPayload): Promise<{ id: string }> {
  const userId = await requireWorkspaceOwnerId();
  const actorId = await requireUserId();
  const { data, error } = await (supabase as any)
    .from("fleet_work_order_drafts")
    .insert({
      user_id: userId,
      created_by: actorId,
      ...payload,
      status: payload.status ?? "draft",
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: String(data.id) };
}

export async function updateDraft(id: string, patch: Partial<WorkOrderDraftPayload>): Promise<void> {
  const { error } = await (supabase as any)
    .from("fleet_work_order_drafts")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteDraft(id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("fleet_work_order_drafts")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function fetchDraft(id: string): Promise<any | null> {
  const { data, error } = await (supabase as any)
    .from("fleet_work_order_drafts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
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
  const { data, error } = await (supabase as any).rpc("validate_fleet_work_order_draft", {
    _draft_id: draftId,
  });
  if (error) throw error;
  return (data as ServerValidationEntry[]) ?? [];
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

export async function resolveDraftPricing(draftId: string): Promise<DraftPricingResult> {
  const { data, error } = await (supabase as any).rpc("resolve_fleet_work_order_draft_pricing", {
    _draft_id: draftId,
  });
  if (error) throw error;
  return data as DraftPricingResult;
}

export async function approveDraft(draftId: string): Promise<void> {
  const { error } = await (supabase as any).rpc("approve_fleet_work_order_draft", {
    _draft_id: draftId,
  });
  if (error) throw error;
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
  const draft = await fetchDraft(draftId);
  if (!draft) throw new Error("Draft not found.");

  if (draft.status !== "approved" && opts.autoApprove === false) {
    throw new Error("Draft must be approved before it can be promoted.");
  }

  if (!draft.customer_id) throw new Error("Draft missing customer.");
  if (!Array.isArray(draft.selected_vehicles) || draft.selected_vehicles.length === 0) {
    throw new Error("Draft has no vehicles selected.");
  }
  if (!draft.service_package) throw new Error("Draft missing service package.");

  const { data, error } = await (supabase as any).rpc("promote_fleet_work_order_draft_v2", { p_draft_id: draftId });
  if (error) throw error;
  const createdIds = (data ?? []).map(String);
  // A Fleet Job is the site visit; each promoted work order remains the
  // vehicle-specific service record. Multi-vehicle drafts therefore become
  // one dispatchable job immediately rather than requiring a second grouping step.
  if (createdIds.length > 0) {
    const { error: jobError } = await supabase.rpc("create_fleet_job_for_work_orders_v1", {
      p_work_order_ids: createdIds,
      p_notes: draft.notes || "Created from multi-vehicle site visit",
    });
    if (jobError) throw jobError;
  }
  opts.onProgress?.(createdIds.length, createdIds.length);
  return { createdIds };
}

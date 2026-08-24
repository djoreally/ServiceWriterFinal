/** Work Order Commands — canonical Final work-order lifecycle. */
import { nextApi } from "@/lib/nextApiClient";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";
import { z } from "zod";

export interface CreateWorkOrderPayload {
  appointmentId?: string;
  customerId?: string | null;
  vehicleId?: string | null;
  technicianId?: string | null;
  vanId?: string | null;
  locationAddress?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  customerNotes?: string | null;
}

export interface CreateWorkOrderResult {
  workOrderId: string;
  orderNumber: string;
}

export type WorkOrderStatus =
  | "created"
  | "draft"
  | "scheduled"
  | "assigned"
  | "in_progress"
  | "waiting_for_parts"
  | "awaiting_approval"
  | "completed"
  | "cancelled";

function workspaceId(): string {
  const id = getSelectedWorkspaceId();
  if (!id) throw new Error("Select a workspace before working with a repair order.");
  return id;
}

function canonicalStatus(status: WorkOrderStatus): Exclude<WorkOrderStatus, "created"> {
  return status === "created" ? "draft" : status;
}

export async function createWorkOrder(
  _userId: string,
  payload: CreateWorkOrderPayload,
): Promise<CreateWorkOrderResult> {
  const workspace_id = workspaceId();
  if (!payload.customerId) throw new Error("A customer is required before creating a repair order.");

  const response = await nextApi.workOrders.create({
    workspace_id,
    appointment_id: payload.appointmentId ?? null,
    customer_id: payload.customerId,
    vehicle_id: payload.vehicleId ?? null,
    technician_id: payload.technicianId ?? null,
    van_id: payload.vanId ?? null,
    location_address: payload.locationAddress ?? null,
    location_lat: payload.locationLat ?? null,
    location_lng: payload.locationLng ?? null,
    customer_notes: payload.customerNotes ?? null,
  });

  const row = z.object({
    id: z.string().uuid(),
    number: z.union([z.number(), z.string()]),
  }).parse(response.data);

  return { workOrderId: row.id, orderNumber: `RO-${String(row.number)}` };
}

export async function advanceWorkOrderStatus(workOrderId: string, newStatus: WorkOrderStatus) {
  const status = canonicalStatus(newStatus);
  const payload: Record<string, unknown> = { workspace_id: workspaceId(), status };
  if (status === "in_progress") payload.started_at = new Date().toISOString();
  if (status === "completed") payload.completed_at = new Date().toISOString();
  await nextApi.workOrders.update(workOrderId, payload);
}

export async function completeWorkOrder(
  workOrderId: string,
  options?: { signatureUrl?: string; techNotes?: string },
) {
  let signatureUrl: string | null = null;
  if (options?.signatureUrl) {
    const value = options.signatureUrl;
    const validDataUrl = value.startsWith("data:image/");
    let validHttps = false;
    try { validHttps = new URL(value).protocol === "https:"; } catch { validHttps = false; }
    if (validDataUrl || validHttps) signatureUrl = value;
    else console.warn(`completeWorkOrder: rejected invalid signature URL for ${workOrderId}`);
  }

  await nextApi.workOrders.update(workOrderId, {
    workspace_id: workspaceId(),
    status: "completed",
    signature_url: signatureUrl,
    tech_notes: options?.techNotes ?? null,
    completed_at: new Date().toISOString(),
  });
}

function checklistUnavailable(): never {
  throw new Error("Repair-order checklist execution has not been rebuilt on Final yet.");
}

/** Final deliberately has no legacy checklist persistence/runtime yet. */
export async function advanceChecklistStep(
  _itemId: string,
  _evidenceUrl?: string | null,
  _notes?: string | null,
): Promise<{ status: string; item_id: string; next_item_id: string | null; execution_phase: string }> {
  return checklistUnavailable();
}

export async function captureWorkOrderVin(workOrderId: string, vin: string) {
  await nextApi.workOrders.update(workOrderId, { workspace_id: workspaceId(), vin_captured: vin });
}

export async function captureWorkOrderMileage(workOrderId: string, mileage: number) {
  await nextApi.workOrders.update(workOrderId, { workspace_id: workspaceId(), mileage_captured: mileage });
}

/** Final deliberately has no legacy checklist persistence/runtime yet. */
export async function updateChecklistItem(
  _itemId: string,
  _updates: { status?: string; evidenceUrl?: string; notes?: string; completedBy?: string },
): Promise<void> {
  checklistUnavailable();
}

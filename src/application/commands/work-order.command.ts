/**
 * Work Order Commands — Create, advance, and complete work orders.
 *
 * Lifecycle: created → in_progress → completed | cancelled
 */

import { supabase } from "@/integrations/supabase/client";

// ============= Types =============

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

export type WorkOrderStatus = "created" | "in_progress" | "completed" | "cancelled";

// ============= Commands =============

/** Create a work order, optionally from an appointment. Copies playbook steps as checklist items. */
export async function createWorkOrder(
  userId: string,
  payload: CreateWorkOrderPayload
): Promise<CreateWorkOrderResult> {
  // 1. Insert the work order
  const { data: wo, error } = await supabase
    .from("work_orders")
    .insert({
      user_id: userId,
      appointment_id: payload.appointmentId ?? null,
      customer_id: payload.customerId ?? null,
      vehicle_id: payload.vehicleId ?? null,
      technician_id: payload.technicianId ?? null,
      van_id: payload.vanId ?? null,
      location_address: payload.locationAddress ?? null,
      location_lat: payload.locationLat ?? null,
      location_lng: payload.locationLng ?? null,
      customer_notes: payload.customerNotes ?? null,
    })
    .select("id, order_number")
    .single();

  if (error) throw new Error(`Failed to create work order: ${error.message}`);

  // 2. If linked to an appointment, hydrate checklist from matching playbooks
  if (payload.appointmentId) {
    await hydrateChecklistFromAppointment(wo.id, payload.appointmentId, userId);
  }

  return { workOrderId: wo.id, orderNumber: wo.order_number };
}

/** Advance work order status with timestamp tracking. */
export async function advanceWorkOrderStatus(
  workOrderId: string,
  newStatus: WorkOrderStatus
) {
  const updates: Record<string, unknown> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  };

  if (newStatus === "in_progress") {
    updates.started_at = new Date().toISOString();
  } else if (newStatus === "completed") {
    updates.completed_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("work_orders")
    .update(updates as never)
    .eq("id", workOrderId);

  if (error) throw new Error(`Failed to update work order status: ${error.message}`);
}

/** Complete a work order with optional signature URL and tech notes. */
export async function completeWorkOrder(
  workOrderId: string,
  options?: { signatureUrl?: string; techNotes?: string }
) {
  // Validate signature URL: must be a base64 data URL or a valid https:// storage URL
  let validatedSignatureUrl: string | null = null;
  if (options?.signatureUrl) {
    const url = options.signatureUrl;
    const isDataUrl = url.startsWith("data:image/");
    const isHttpsUrl = (() => {
      try {
        const parsed = new URL(url);
        return parsed.protocol === "https:";
      } catch {
        return false;
      }
    })();
    if (isDataUrl || isHttpsUrl) {
      validatedSignatureUrl = url;
    } else {
      // Log a warning when an invalid signature URL is rejected so it is not silently lost
      console.warn(`completeWorkOrder: signature URL was rejected (not a valid data: or https: URL) for work order ${workOrderId}`);
    }
  }

  const { error } = await supabase
    .from("work_orders")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      signature_url: validatedSignatureUrl,
      tech_notes: options?.techNotes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", workOrderId);

  if (error) throw new Error(`Failed to complete work order: ${error.message}`);
}

/**
 * Advance a checklist step via the enforcement RPC.
 * Hard-blocks out-of-order completion and missing evidence at the DB level.
 * Returns { status, item_id, next_item_id, execution_phase }.
 */
export async function advanceChecklistStep(
  itemId: string,
  evidenceUrl?: string | null,
  notes?: string | null
): Promise<{ status: string; item_id: string; next_item_id: string | null; execution_phase: string }> {
  const { data, error } = await supabase.rpc("advance_checklist_step" as any, {
    p_item_id: itemId,
    p_evidence_url: evidenceUrl ?? null,
    p_notes: notes ?? null,
  });

  if (error) {
    // Surface enforcement errors cleanly to the UI
    const msg = error.message || "Step completion blocked";
    const match = msg.match(/ENFORCEMENT_ERROR:\s*(.+)/);
    throw new Error(match ? match[1] : msg);
  }

  return data as any;
}

/** Capture VIN on a work order (required before completion if requires_vin). */
export async function captureWorkOrderVin(workOrderId: string, vin: string) {
  const { error } = await supabase
    .from("work_orders")
    .update({ vin_captured: vin, updated_at: new Date().toISOString() })
    .eq("id", workOrderId);
  if (error) throw new Error(`Failed to capture VIN: ${error.message}`);
}

/** Capture mileage on a work order (required before completion if requires_mileage). */
export async function captureWorkOrderMileage(workOrderId: string, mileage: number) {
  const { error } = await supabase
    .from("work_orders")
    .update({ mileage_captured: mileage, updated_at: new Date().toISOString() })
    .eq("id", workOrderId);
  if (error) throw new Error(`Failed to capture mileage: ${error.message}`);
}

/**
 * Legacy updateChecklistItem — kept for non-enforced updates (e.g. adding notes
 * to an already-completed step). For step completion, use advanceChecklistStep.
 */
export async function updateChecklistItem(
  itemId: string,
  updates: {
    status?: string;
    evidenceUrl?: string;
    notes?: string;
    completedBy?: string;
  }
) {
  const payload: Record<string, unknown> = {};
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.evidenceUrl !== undefined) payload.evidence_url = updates.evidenceUrl;
  if (updates.notes !== undefined) payload.notes = updates.notes;

  if (updates.status === "completed") {
    payload.completed_at = new Date().toISOString();
    if (updates.completedBy) payload.completed_by = updates.completedBy;
  }

  const { error } = await supabase
    .from("work_order_checklist_items")
    .update(payload as never)
    .eq("id", itemId);

  if (error) throw new Error(`Failed to update checklist item: ${error.message}`);
}

// ============= Internal Helpers =============

/**
 * Hydrate checklist items from service playbooks matching the appointment's
 * catalog items (via appointment_services).
 */
async function hydrateChecklistFromAppointment(
  workOrderId: string,
  appointmentId: string,
  userId: string
) {
  // Get catalog IDs from appointment_services
  const { data: aptServices } = await supabase
    .from("appointment_services")
    .select("service_catalog_id")
    .eq("appointment_id", appointmentId)
    .not("service_catalog_id", "is", null);

  if (!aptServices?.length) return;

  const catalogIds = aptServices
    .map((s) => s.service_catalog_id)
    .filter(Boolean) as string[];

  if (!catalogIds.length) return;

  // Fetch active playbooks for these catalog items
  const { data: playbooks } = await supabase
    .from("service_playbooks")
    .select("id, steps")
    .eq("user_id", userId)
    .eq("is_active", true)
    .in("service_catalog_id", catalogIds);

  if (!playbooks?.length) return;

  // Flatten all steps into checklist items
  type PlaybookStep = { name: string; requires_photo?: boolean };
  const items: Array<{
    work_order_id: string;
    playbook_id: string;
    step_name: string;
    step_order: number;
    requires_photo: boolean;
  }> = [];

  let globalOrder = 0;
  for (const pb of playbooks) {
    const steps = (pb.steps as PlaybookStep[]) || [];
    for (const step of steps) {
      items.push({
        work_order_id: workOrderId,
        playbook_id: pb.id,
        step_name: step.name,
        step_order: globalOrder++,
        requires_photo: step.requires_photo ?? false,
      });
    }
  }

  if (items.length > 0) {
    await supabase.from("work_order_checklist_items").insert(items);
  }
}

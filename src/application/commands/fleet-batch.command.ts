import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface BatchServiceRecordPayload {
  workOrderIds: string[];
  mileageAtService?: number;
  technicianNotes?: string;
  status: "completed" | "invoiced";
}

export interface BatchAssignPayload {
  workOrderIds: string[];
  technicianId?: string | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  status?: string;
}

/**
 * Batch assign technician and/or schedule date to multiple work orders.
 */
export async function batchAssignFleetWorkOrders(
  payload: BatchAssignPayload
): Promise<{ success: number; failed: number }> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Unauthorized");

  let success = 0;
  let failed = 0;

  for (const id of payload.workOrderIds) {
    try {
      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (payload.technicianId !== undefined) {
        updates.assigned_technician_id = payload.technicianId;
      }
      if (payload.scheduledDate !== undefined) {
        updates.scheduled_date = payload.scheduledDate;
      }
      if (payload.scheduledTime !== undefined) {
        updates.scheduled_time = payload.scheduledTime;
      }
      if (payload.status) {
        updates.status = payload.status;
      }

      const { error } = await supabase
        .from("fleet_work_orders")
        .update(updates as never)
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;

      // Log activity
      const details: Record<string, string> = {};
      if (payload.technicianId) details.technician_id = payload.technicianId;
      if (payload.scheduledDate) details.scheduled_date = payload.scheduledDate;
      if (payload.status) details.status = payload.status;

      await supabase.from("fleet_activity_logs").insert({
        fleet_work_order_id: id,
        user_id: user.id,
        action: "batch_update",
        actor_role: "provider",
        details: { message: "Batch update", ...details },
      });

      success++;
    } catch (err) {
      console.error(`Failed to batch update WO ${id}`, err);
      failed++;
    }
  }

  return { success, failed };
}

/**
 * Processes multiple work orders at once (status change).
 */
export async function processBatchFleetWorkOrders(
  payload: BatchServiceRecordPayload
): Promise<{ success: number; failed: number }> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Unauthorized");

  let success = 0;
  let failed = 0;

  for (const id of payload.workOrderIds) {
    try {
      const updates: Record<string, unknown> = {
        status: payload.status,
        updated_at: new Date().toISOString(),
      };

      if (payload.status === "completed") {
        updates.completed_at = new Date().toISOString();
      }

      if (payload.mileageAtService) {
        updates.mileage_at_service = payload.mileageAtService;
      }

      if (payload.technicianNotes) {
        updates.technician_notes = payload.technicianNotes;
      }

      const { error } = await supabase
        .from("fleet_work_orders")
        .update(updates as never)
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;

      await supabase.from("fleet_activity_logs").insert({
        fleet_work_order_id: id,
        user_id: user.id,
        action: payload.status,
        actor_role: "provider",
        details: { message: `Batch processed: ${payload.status}` },
      });

      success++;
    } catch (err) {
      console.error(`Failed to process WO ${id}`, err);
      failed++;
    }
  }

  return { success, failed };
}

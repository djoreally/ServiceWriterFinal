import { apiClient } from "@/lib/api-client";

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

  const { data } = await apiClient.post<{ data: { success: number; failed: number } }>(
    "/v1/fleet/work-orders/batch-assign",
    { payload },
  );
  return data;
}

/**
 * Processes multiple work orders at once (status change).
 */
export async function processBatchFleetWorkOrders(
  payload: BatchServiceRecordPayload
): Promise<{ success: number; failed: number }> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Unauthorized");

  const { data } = await apiClient.post<{ data: { success: number; failed: number } }>(
    "/v1/fleet/work-orders/batch-process",
    { payload },
  );
  return data;
}

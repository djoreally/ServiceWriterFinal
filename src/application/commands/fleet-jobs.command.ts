/**
 * Fleet Job Commands — write operations for multi-vehicle fleet jobs.
 *
 * All mutations route through the security-definer RPCs that own grouping,
 * cascaded assignment, and dispatch audit events.
 */
import { apiClient } from "@/lib/api-client";

export interface CreateFleetJobResult {
  jobId: string;
  jobNumber: string | null;
  workOrders: number;
}

/** Group one or more same-client vehicle work orders into a dispatchable site visit. */
export async function createFleetJobFromWorkOrders(
  workOrderIds: string[],
  notes?: string,
): Promise<CreateFleetJobResult> {
  const { data } = await apiClient.post<{ data: CreateFleetJobResult }>(
    "/v1/fleet/jobs/from-work-orders",
    { work_order_ids: workOrderIds, notes: notes ?? null },
  );
  return data;
}

/**
 * Assign/schedule a fleet job once — technician, date, start, and duration
 * cascade to every open child work order in one transaction.
 * Returns the number of work orders updated.
 */
export async function assignFleetJob(input: {
  jobId: string;
  technicianId: string;
  date: string;
  start: string;
  durationMinutes?: number;
}): Promise<number> {
  const { data } = await apiClient.post<{ data: { assignedWorkOrders: number } }>(
    `/v1/fleet/jobs/${input.jobId}/assign`,
    {
      technician_id: input.technicianId,
      date: input.date,
      start: input.start,
      duration_minutes: input.durationMinutes ?? 60,
    },
  );
  return data.assignedWorkOrders;
}

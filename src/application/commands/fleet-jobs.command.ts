/**
 * Fleet Job Commands — write operations for multi-vehicle fleet jobs.
 *
 * All mutations route through the security-definer RPCs that own grouping,
 * cascaded assignment, and dispatch audit events.
 */
import { supabase } from "@/integrations/supabase/client";

export interface CreateFleetJobResult {
  jobId: string;
  jobNumber: string | null;
  workOrders: number;
}

const FLEET_JOB_ERROR_MESSAGES: Record<string, string> = {
  fleet_job_access_denied: "You do not have permission to manage fleet jobs.",
  fleet_assignment_access_denied: "You do not have permission to assign fleet jobs.",
};

function formatFleetJobError(message?: string): string {
  if (!message) return "Fleet job operation failed";
  return FLEET_JOB_ERROR_MESSAGES[message] ?? message;
}

/** Group one or more same-client vehicle work orders into a dispatchable site visit. */
export async function createFleetJobFromWorkOrders(
  workOrderIds: string[],
  notes?: string,
): Promise<CreateFleetJobResult> {
  const { data, error } = await supabase.rpc("create_fleet_job_for_work_orders_v1", {
    p_work_order_ids: workOrderIds,
    ...(notes ? { p_notes: notes } : {}),
  });
  if (error) throw new Error(formatFleetJobError(error.message));

  const payload = data as { job_id?: string; job_number?: string | null; work_orders?: number } | null;
  return {
    jobId: payload?.job_id ?? "",
    jobNumber: payload?.job_number ?? null,
    workOrders: payload?.work_orders ?? workOrderIds.length,
  };
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
  const { data, error } = await supabase.rpc("assign_fleet_job_v1", {
    p_job_id: input.jobId,
    p_technician_id: input.technicianId,
    p_date: input.date,
    p_start: input.start,
    p_duration_minutes: input.durationMinutes ?? 60,
  });
  if (error) throw new Error(formatFleetJobError(error.message));
  return Number((data as { assigned_work_orders?: number } | null)?.assigned_work_orders ?? 0);
}

/**
 * Dispatch Command - Write operations for dispatching and job assignment.
 */

import { supabase } from "@/integrations/supabase/client";

export interface DispatchAssignmentInput {
  jobSource: "appointment" | "fleet_work_order";
  jobId: string;
  technicianId?: string | null;
  vanId?: string | null;
  date?: string | null;
  start?: string | null;
  durationMinutes?: number;
  expectedUpdatedAt?: string | null;
  notes?: string | null;
}

const DISPATCH_ASSIGNMENT_ERROR_MESSAGES: Record<string, string> = {
  appointment_not_found: "Appointment not found. Refresh the dispatch board and try again.",
  fleet_work_order_not_found: "Fleet work order not found. Refresh the dispatch board and try again.",
  technician_schedule_conflict: "This technician already has work during the selected time.",
  work_order_changed_refresh_before_assigning: "This work order changed. Refresh before assigning.",
  assignment_target_required: "Choose a technician or van before assigning this job.",
  technician_required: "Choose a technician before assigning this fleet work order.",
  technician_unavailable: "This technician is unavailable or inactive.",
  van_unavailable: "This van is unavailable or inactive.",
  scheduled_date_required: "Choose a scheduled date before assigning this fleet work order.",
  dispatch_assignment_access_denied: "You do not have permission to assign dispatch jobs.",
};

function formatDispatchAssignmentError(message?: string): string {
  if (!message) return "Dispatch assignment failed";
  return DISPATCH_ASSIGNMENT_ERROR_MESSAGES[message] ?? message;
}

/** Route every assignment through the shared, permission-checked, source-aware backend boundary. */
export async function assignDispatchJob(input: DispatchAssignmentInput): Promise<void> {
  const { error } = await (supabase as any).rpc("assign_dispatch_job_v1", {
    p_job_source: input.jobSource,
    p_job_id: input.jobId,
    p_technician_id: input.technicianId ?? null,
    p_van_id: input.vanId ?? null,
    p_date: input.date || null,
    p_start: input.start || null,
    p_duration_minutes: input.durationMinutes ?? 60,
    p_expected_updated_at: input.expectedUpdatedAt ?? null,
    p_notes: input.notes ?? null,
  });
  if (error) throw new Error(formatDispatchAssignmentError(error.message));
}

/**
 * Public (guest) booking auto-dispatch.
 *
 * `assign_dispatch_job_v1` is authenticated-only and derives the workspace from
 * `auth.uid()`, so anonymous visitors cannot call it. This wrapper RPC performs
 * the same appointment assignment server-side for a freshly created booking.
 */
export async function autoDispatchPublicBooking(input: {
  businessUserId: string;
  appointmentId: string;
  zipCode?: string | null;
  notes?: string | null;
}): Promise<{ assigned: boolean; van_id?: string | null; technician_id?: string | null; reason?: string }> {
  const { data, error } = await (supabase as any).rpc("auto_dispatch_public_booking_v1", {
    p_business_user_id: input.businessUserId,
    p_appointment_id: input.appointmentId,
    p_zip_code: input.zipCode ?? null,
    p_notes: input.notes ?? null,
  });
  if (error) throw new Error(formatDispatchAssignmentError(error.message));
  return (data ?? { assigned: false }) as { assigned: boolean };
}

/** Assign through the shared, permission-checked and audited dispatch boundary. */
export async function assignTechnician(
  appointmentId: string,
  technicianId: string,
  notes?: string | null,
): Promise<void> {
  return assignDispatchJob({
    jobSource: "appointment",
    jobId: appointmentId,
    technicianId,
    notes,
  });
}

/** Assign a van through the same audited dispatch boundary. */
export async function assignVan(
  appointmentId: string,
  vanId: string,
): Promise<void> {
  return assignDispatchJob({
    jobSource: "appointment", jobId: appointmentId, vanId,
  });
}

/** Return an appointment back to the unassigned dispatch board queue. */
export async function unassignAppointment(appointmentId: string): Promise<void> {
  return assignDispatchJob({
    jobSource: "appointment", jobId: appointmentId, durationMinutes: 0,
  });
}

/** Return a fleet work order back to the unassigned fleet dispatch queue. */
export async function unassignFleetWorkOrder(workOrderId: string): Promise<void> {
  return assignDispatchJob({
    jobSource: "fleet_work_order", jobId: workOrderId, durationMinutes: 0,
  });
}

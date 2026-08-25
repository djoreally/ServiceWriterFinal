/** Dispatch commands for the unified Service Writer Command Center. */
import { nextApi } from "@/lib/nextApiClient";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";

export interface DispatchAssignmentInput {
  jobSource: "appointment" | "work_order";
  jobId: string;
  technicianId?: string | null;
  notes?: string | null;
}

const DISPATCH_ASSIGNMENT_ERROR_MESSAGES: Record<string, string> = {
  appointment_not_found: "Appointment not found. Refresh Dispatch and try again.",
  work_order_not_found: "Repair order not found. Refresh Dispatch and try again.",
  technician_unavailable: "This technician is unavailable or inactive.",
  dispatch_assignment_access_denied: "You do not have permission to assign dispatch jobs.",
  unsupported_dispatch_source: "This job type is not supported by Service Writer Dispatch.",
};

function formatDispatchAssignmentError(message?: string): string {
  if (!message) return "Dispatch assignment failed";
  return DISPATCH_ASSIGNMENT_ERROR_MESSAGES[message] ?? message;
}

export async function assignDispatchJob(input: DispatchAssignmentInput): Promise<void> {
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error("Select a workspace before assigning dispatch work.");
  try {
    await nextApi.dispatch.assign({
      workspace_id,
      job_source: input.jobSource,
      job_id: input.jobId,
      technician_id: input.technicianId ?? null,
      notes: input.notes ?? null,
    });
  } catch (error) {
    throw new Error(formatDispatchAssignmentError(error instanceof Error ? error.message : undefined));
  }
}

/** Public bookings remain unassigned until a dispatcher/staff member assigns them. */
export async function autoDispatchPublicBooking(_input: {
  businessUserId: string;
  appointmentId: string;
  zipCode?: string | null;
  notes?: string | null;
}): Promise<{ assigned: boolean; technician_id?: string | null; reason?: string }> {
  return { assigned: false, technician_id: null, reason: "manual_dispatch_required" };
}

export async function assignTechnician(appointmentId: string, technicianId: string, notes?: string | null): Promise<void> {
  return assignDispatchJob({ jobSource: "appointment", jobId: appointmentId, technicianId, notes });
}

export async function assignWorkOrderTechnician(workOrderId: string, technicianId: string, notes?: string | null): Promise<void> {
  return assignDispatchJob({ jobSource: "work_order", jobId: workOrderId, technicianId, notes });
}

export async function unassignAppointment(appointmentId: string): Promise<void> {
  return assignDispatchJob({ jobSource: "appointment", jobId: appointmentId, technicianId: null });
}

export async function unassignWorkOrder(workOrderId: string): Promise<void> {
  return assignDispatchJob({ jobSource: "work_order", jobId: workOrderId, technicianId: null });
}

/** Deprecated compatibility exports: vans/Fleet are outside Service Writer Dispatch. */
export async function assignVan(_appointmentId: string, _vanId: string): Promise<void> {
  throw new Error("Van assignment is not part of Service Writer Dispatch.");
}

export async function unassignFleetWorkOrder(_workOrderId: string): Promise<void> {
  throw new Error("Fleet dispatch is separate from Service Writer.");
}

/**
 * Edit appointment command - inline update from dialog
 */
import { nextApi } from "@/lib/nextApiClient";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";

export interface EditAppointmentPayload {
  title: string;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  status: string;
  notes: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  estimated_cost: number;
  location_address?: string | null;
  customer_city?: string | null;
  customer_state?: string | null;
  customer_postal_code?: string | null;
}

export async function editAppointment(appointmentId: string, payload: EditAppointmentPayload): Promise<void> {
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error("Select a workspace before editing an appointment.");
  await nextApi.appointments.update(appointmentId, { workspace_id, ...payload });
}

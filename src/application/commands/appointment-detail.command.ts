/**
 * Appointment Detail Commands — canonical appointment writes.
 *
 * Phase 2: all data access goes through the typed API client
 * (`@/lib/api-client`) to the appointments Hono router. Exported signatures
 * are unchanged. The server resolves the workspace from the auth token.
 */
import { errorMessage } from "@/lib/error-message";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import { trackAppointmentStatusChanged } from "@/lib/posthog/analytics";
import { nextApi } from "@/lib/nextApiClient";
import { apiClient } from "@/lib/api-client";
import { updateTechJobDispatchStatus } from "@/application/commands/tech-app.command";

async function readCurrentStatus(_workspaceId: string, id: string): Promise<string | undefined> {
  const response = await apiClient.get<{ data: { status?: string } | null }>(
    `/v1/appointments/${encodeURIComponent(id)}`,
    { query: { selected_workspace_id: (await resolveCurrentWorkspace())?.workspaceId } },
  );
  return response.data?.status ?? undefined;
}

export async function updateAppointmentStatus(id: string, status: string) {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("No active workspace is available.");

  let fromStatus: string | undefined;
  try {
    fromStatus = await readCurrentStatus(context.workspaceId, id);
  } catch { /* analytics/readback never blocks mutation */ }

  let response;
  if (status === "completed") {
    response = await nextApi.appointments.complete(id, context.workspaceId);
  } else if (status === "cancelled") {
    response = await nextApi.appointments.cancel(context.workspaceId, id);
  } else {
    response = await nextApi.appointments.update(id, { workspace_id: context.workspaceId, status });
  }

  queueMicrotask(() => trackAppointmentStatusChanged({
    appointment_id: id,
    organization_id: context.workspaceId,
    from_status: fromStatus,
    to_status: status,
    trigger: "user",
  }));

  return response;
}

/** Appointment deletion is a business cancellation, never a physical row delete. */
export async function deleteAppointment(id: string) {
  const context = await resolveCurrentWorkspace();
  if (!context) return { data: null, error: new Error("No active workspace is available.") };
  try {
    const response = await nextApi.appointments.cancel(context.workspaceId, id);
    return { data: response.data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

/**
 * Start an appointment through the same atomic transition path used by the
 * technician app. This prevents the appointment-detail UI from drifting onto a
 * second mutation contract with different authorization/presence semantics.
 */
export async function startAppointmentJob(appointmentId: string): Promise<{ success: boolean; alreadyStarted?: boolean; error?: string }> {
  try {
    const context = await resolveCurrentWorkspace();
    if (!context) return { success: false, error: "No active workspace is available." };

    const currentStatus = await readCurrentStatus(context.workspaceId, appointmentId).catch(() => undefined);
    if (currentStatus === "in_progress") return { success: true, alreadyStarted: true };

    const { error } = await updateTechJobDispatchStatus(appointmentId, "in_progress", undefined, false);
    if (error) return { success: false, error };

    return { success: true, alreadyStarted: false };
  } catch (err: unknown) {
    return { success: false, error: errorMessage(err, "Failed to start job") };
  }
}

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

/** Start the job through a role-limited canonical endpoint. */
export async function startAppointmentJob(appointmentId: string): Promise<{ success: boolean; alreadyStarted?: boolean; error?: string }> {
  try {
    const body = await apiClient.post<{ data?: { already_started?: boolean } }>(
      `/v1/appointments/${encodeURIComponent(appointmentId)}/start`,
      {},
    );
    return { success: true, alreadyStarted: body.data?.already_started === true };
  } catch (err: unknown) {
    return { success: false, error: errorMessage(err, "Failed to start job") };
  }
}

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

function isCanonicalStartRpcUnavailable(error: unknown): boolean {
  const raw = errorMessage(error, "").toLowerCase();
  return raw.includes("start_appointment_job_v1")
    || raw.includes("pgrst202")
    || raw.includes("schema cache")
    || raw.includes("could not find the function")
    || raw.includes("function public.start_appointment_job_v1");
}

/**
 * Start an appointment through the appointment-domain start endpoint. That
 * endpoint owns authorization, lifecycle mutation, timestamps, dispatch state,
 * and technician-presence synchronization.
 *
 * Production safety net: if the canonical start RPC is temporarily unavailable
 * because a database migration/schema-cache refresh has not landed yet, fall
 * back to the existing authenticated appointment PATCH path. That path already
 * stamps actual_start_time when status enters in_progress. We only use this
 * fallback for explicit RPC/schema-cache failures; authorization and business
 * rule failures are never bypassed.
 */
export async function startAppointmentJob(appointmentId: string): Promise<{ success: boolean; alreadyStarted?: boolean; error?: string }> {
  try {
    const context = await resolveCurrentWorkspace();
    if (!context) return { success: false, error: "No active workspace is available." };

    const currentStatus = await readCurrentStatus(context.workspaceId, appointmentId).catch(() => undefined);
    if (currentStatus === "in_progress") return { success: true, alreadyStarted: true };
    if (["completed", "cancelled", "no_show"].includes(String(currentStatus ?? "").toLowerCase())) {
      return { success: false, error: "This appointment can no longer be started." };
    }

    try {
      // Idempotency-Key is stable per (actor, appointment): a retried start
      // (double-tap, timeout retry) replays the stored result server-side
      // instead of re-executing the transition.
      const response = await apiClient.post<{ data: { status?: string; already_started?: boolean } | null }>(
        `/v1/appointments/${encodeURIComponent(appointmentId)}/start`,
        { selected_workspace_id: context.workspaceId },
        { headers: { "Idempotency-Key": `appointment-start:${appointmentId}` } },
      );

      return {
        success: response.data?.status === "in_progress",
        alreadyStarted: Boolean(response.data?.already_started),
        ...(response.data?.status === "in_progress" ? {} : { error: "Appointment did not enter in-progress state." }),
      };
    } catch (startError) {
      if (!isCanonicalStartRpcUnavailable(startError)) throw startError;

      await nextApi.appointments.update(appointmentId, {
        workspace_id: context.workspaceId,
        status: "in_progress",
      });

      const readbackStatus = await readCurrentStatus(context.workspaceId, appointmentId).catch(() => undefined);
      if (readbackStatus !== "in_progress") {
        return { success: false, error: "Appointment did not enter in-progress state." };
      }
      return { success: true, alreadyStarted: false };
    }
  } catch (err: unknown) {
    return { success: false, error: errorMessage(err, "Failed to start job") };
  }
}

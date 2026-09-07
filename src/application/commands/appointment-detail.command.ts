/** Appointment Detail Commands — canonical appointment writes. */
import { errorMessage } from "@/lib/error-message";
import { productionSupabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import { trackAppointmentStatusChanged } from "@/lib/posthog/analytics";
import { nextApi } from "@/lib/nextApiClient";

const db = productionSupabase as any;

async function readCurrentStatus(workspaceId: string, id: string): Promise<string | undefined> {
  const { data } = await db
    .from("appointments")
    .select("status,workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .maybeSingle();
  return data?.status ?? undefined;
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
    const context = await resolveCurrentWorkspace();
    if (!context) throw new Error("No active workspace is available.");
    const { data: { session } } = await productionSupabase.auth.getSession();
    if (!session?.access_token) throw new Error("Authentication required to start this appointment.");
    const response = await fetch(`/api/v1/appointments/${encodeURIComponent(appointmentId)}/start`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ workspace_id: context.workspaceId }),
    });
    const body = await response.json().catch(() => ({})) as { data?: { already_started?: boolean }; error?: { message?: string } };
    if (!response.ok) throw new Error(body.error?.message || "Failed to start job");
    return { success: true, alreadyStarted: body.data?.already_started === true };
  } catch (err: unknown) {
    return { success: false, error: errorMessage(err, "Failed to start job") };
  }
}

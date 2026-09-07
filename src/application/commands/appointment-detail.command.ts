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

/** Start the job through the canonical appointment mutation API. */
export async function startAppointmentJob(appointmentId: string): Promise<{ success: boolean; alreadyStarted?: boolean; error?: string }> {
  try {
    const context = await resolveCurrentWorkspace();
    if (!context) throw new Error("No active workspace is available.");
    const currentStatus = await readCurrentStatus(context.workspaceId, appointmentId);
    if (!currentStatus) throw new Error("Appointment not found in the active workspace.");
    if (currentStatus === "in_progress") return { success: true, alreadyStarted: true };
    await nextApi.appointments.update(appointmentId, { workspace_id: context.workspaceId, status: "in_progress" });
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: errorMessage(err, "Failed to start job") };
  }
}

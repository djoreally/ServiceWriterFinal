/** Appointment Detail Commands — canonical appointment writes. */
import { errorMessage } from "@/lib/error-message";
import { productionSupabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import { trackAppointmentStatusChanged } from "@/lib/posthog/analytics";
const db = productionSupabase as any;

export async function updateAppointmentStatus(id: string, status: string) {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("No active workspace is available.");
  let fromStatus: string | undefined;
  try {
    const { data: prev } = await db.from("appointments").select("status,workspace_id").eq("workspace_id", context.workspaceId).eq("id", id).maybeSingle();
    fromStatus = prev?.status ?? undefined;
    if (prev?.workspace_id) queueMicrotask(() => trackAppointmentStatusChanged({ appointment_id: id, organization_id: prev.workspace_id, from_status: fromStatus, to_status: status, trigger: "user" }));
  } catch { /* analytics never blocks mutation */ }

  const res = await db.from("appointments").update({ status, updated_at: new Date().toISOString() }).eq("workspace_id", context.workspaceId).eq("id", id).select("id,status").maybeSingle();
  if (res.error) throw new Error(errorMessage(res.error, "Failed to update appointment status"), { cause: res.error });
  if (!res.data) throw new Error("You don't have permission to update this appointment, or it no longer exists.");
  return res;
}

export async function deleteAppointment(id: string) {
  const context = await resolveCurrentWorkspace();
  if (!context) return { data: null, error: new Error("No active workspace is available.") };
  return db.from("appointments").delete().eq("workspace_id", context.workspaceId).eq("id", id);
}

/** Start the job through the authenticated Supabase browser session. */
export async function startAppointmentJob(appointmentId: string): Promise<{ success: boolean; alreadyStarted?: boolean; error?: string }> {
  try {
    const context = await resolveCurrentWorkspace();
    if (!context) throw new Error("No active workspace is available.");
    const { data: current, error: readError } = await db.from("appointments").select("id,status,metadata").eq("workspace_id", context.workspaceId).eq("id", appointmentId).maybeSingle();
    if (readError) throw readError;
    if (!current) throw new Error("Appointment not found in the active workspace.");
    if (current.status === "in_progress") return { success: true, alreadyStarted: true };
    const metadata = current.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata) ? current.metadata as Record<string, unknown> : {};
    const { data, error } = await db.from("appointments").update({ status: "in_progress", metadata: { ...metadata, actual_start_time: new Date().toISOString() }, updated_at: new Date().toISOString() }).eq("workspace_id", context.workspaceId).eq("id", appointmentId).select("id,status").maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("You don't have permission to start this appointment.");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: errorMessage(err, "Failed to start job") };
  }
}

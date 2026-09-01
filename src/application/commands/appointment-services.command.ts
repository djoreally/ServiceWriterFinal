/** Appointment line-item commands against the canonical workspace schema. */
import { productionSupabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export async function removeAppointmentService(serviceId: string): Promise<void> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("No active workspace is available.");
  const { error } = await productionSupabase.from("appointment_items")
    .delete().eq("workspace_id", context.workspaceId).eq("id", serviceId);
  if (error) throw new Error("Failed to remove service");
}

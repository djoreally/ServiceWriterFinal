/**
 * Team Members Commands — Write operations for canonical workspace membership.
 */
import { supabase } from "@/integrations/supabase/client";
import { nextApi } from "@/lib/nextApiClient";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface TechnicianProfileUpdate {
  display_name?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
}

/**
 * Direct technician-row creation is retired. Staff identities must be created
 * through the invitation flow so Supabase Auth and workspace membership remain
 * the source of truth.
 */
export async function addTechnician(
  _userId: string,
  _data: Record<string, unknown>,
) {
  return {
    data: null,
    error: new Error("Create technicians through the team invitation flow."),
  };
}

export async function createTeamInvitation(workspaceId: string, email: string, _name: string, role: string): Promise<{ data: Awaited<ReturnType<typeof nextApi.invitations.create>> | null; error: unknown }> {
  try {
    const data = await nextApi.invitations.create({
      workspace_id: workspaceId,
      invited_email: email,
      invited_role: role as "owner" | "admin" | "manager" | "service_advisor" | "technician" | "dispatcher" | "receptionist" | "fleet_manager" | "viewer" | "customer",
    });
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

export async function cancelTeamInvitation(invitationId: string): Promise<{ data: Awaited<ReturnType<typeof nextApi.invitations.revoke>> | null; error: unknown }> {
  try {
    const data = await nextApi.invitations.revoke(invitationId);
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

export async function updateTechnician(userId: string, data: TechnicianProfileUpdate) {
  return supabase.from("profiles").update(data).eq("id", userId);
}

export async function uploadTeamDocument(filePath: string, file: File) {
  return supabase.storage.from("team-documents").upload(filePath, file, { upsert: true });
}

export async function deleteTechnician(userId: string) {
  const context = await resolveCurrentWorkspace();
  if (!context) return { data: null, error: new Error("No active workspace is available.") };
  return supabase
    .from("workspace_members")
    .update({ is_active: false })
    .eq("workspace_id", context.workspaceId)
    .eq("user_id", userId);
}

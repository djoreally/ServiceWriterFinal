/**
 * Team Members Query — Read operations for team member and invitation management.
 */
import { supabase } from "@/integrations/supabase/client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { nextApi } from "@/lib/nextApiClient";

export async function getAuthUser() {
  const { data: { user } } = await getCurrentAuthUser();
  return user;
}

export async function fetchTeamMembers(userId: string) {
  return supabase
    .from("technicians")
    .select("*")
    .eq("user_id", userId)
    .order("name");
}

export async function fetchTeamInvitations(workspaceId: string) {
  try {
    const response = await nextApi.invitations.list(workspaceId);
    const now = Date.now();
    return {
      data: response.data.map((invitation) => ({
        id: invitation.id,
        email: invitation.invited_email,
        name: invitation.invited_email,
        role: invitation.invited_role,
        status: invitation.accepted_at ? "accepted" : invitation.revoked_at ? "cancelled" : new Date(invitation.expires_at).getTime() <= now ? "expired" : "pending",
        created_at: invitation.created_at,
        expires_at: invitation.expires_at,
      })),
      error: null as unknown,
    };
  } catch (error) {
    return { data: null as Awaited<ReturnType<typeof nextApi.invitations.list>>["data"] | null, error };
  }
}

export function getTeamDocumentUrl(filePath: string) {
  return supabase.storage.from("team-documents").getPublicUrl(filePath);
}

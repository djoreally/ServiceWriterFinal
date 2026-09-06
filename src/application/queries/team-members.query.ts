/**
 * Team Members Query — Read operations for team member and invitation management.
 */
import { supabase } from "@/integrations/supabase/client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { nextApi } from "@/lib/nextApiClient";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export async function getAuthUser() {
  const { data: { user } } = await getCurrentAuthUser();
  return user;
}

export async function fetchTeamMembers(_userId: string) {
  const context = await resolveCurrentWorkspace();
  if (!context) return { data: [], error: null };

  const { data: members, error } = await supabase
    .from("workspace_members")
    .select("user_id, role, is_active, created_at, updated_at")
    .eq("workspace_id", context.workspaceId)
    .eq("is_active", true);
  if (error) return { data: null, error };

  const userIds = (members ?? []).map((member) => member.user_id);
  if (!userIds.length) return { data: [], error: null };

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name, phone, avatar_url")
    .in("id", userIds);
  if (profileError) return { data: null, error: profileError };

  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const data = (members ?? [])
    .map((member) => {
      const profile = profileById.get(member.user_id);
      return {
        id: member.user_id,
        user_id: member.user_id,
        name: profile?.display_name || "Team Member",
        phone: profile?.phone ?? null,
        avatar_url: profile?.avatar_url ?? null,
        role: member.role,
        status: member.is_active ? "active" : "inactive",
        is_active: member.is_active,
        created_at: member.created_at,
        updated_at: member.updated_at,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return { data, error: null };
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

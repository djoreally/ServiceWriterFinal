/**
 * Team Members Query — Read operations for team member and invitation management.
 *
 * Phase 2: team reads go through the typed API client (`@/lib/api-client`)
 * to the work-orders Hono router. Invitation reads stay on the grandfathered
 * typed `nextApi` wrapper, which is itself a sanctioned domain wrapper.
 * Exported signatures are unchanged.
 */
import { apiClient } from "@/lib/api-client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { nextApi } from "@/lib/nextApiClient";

export async function getAuthUser() {
  const { data: { user } } = await getCurrentAuthUser();
  return user;
}

export interface TeamMemberRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  avatar_url: string | null;
  status: string;
  is_active: boolean | null;
  working_hours: Record<string, { start: string; end: string }> | null;
  skills: string[] | null;
  auth_user_id: string | null;
  drivers_license_url: string | null;
  drivers_license_number: string | null;
  drivers_license_expiry: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  hourly_rate: number | null;
  hire_date: string | null;
  max_jobs_per_day: number | null;
  created_at: string;
}

export async function fetchTeamMembers(userId: string) {
  const response = await apiClient.get<{ data: TeamMemberRow[] }>("/v1/technicians", {
    query: { user_id: userId },
  });
  return { data: response.data, error: null as null };
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

const TEAM_DOCUMENTS_BUCKET = "team-documents";

function storageBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  return (envUrl || "https://rjfbrfognxqkyhdrpibx.supabase.co").replace(/\/$/, "");
}

/**
 * Synchronous public-URL builder for the team-documents bucket. Public
 * storage URLs are deterministic (no network call), so the sync signature is
 * preserved without touching the browser Supabase client.
 */
export function getTeamDocumentUrl(filePath: string) {
  return {
    data: {
      publicUrl: `${storageBaseUrl()}/storage/v1/object/public/${TEAM_DOCUMENTS_BUCKET}/${filePath}`,
    },
  };
}

/**
 * Team Members Query — Read operations for team member and invitation management.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
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

export async function fetchTeamInvitations(userId: string) {
  return supabase
    .from("team_invitations")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
}

export function getTeamDocumentUrl(filePath: string) {
  return supabase.storage.from("team-documents").getPublicUrl(filePath);
}

/**
 * Team Login Query — Abstracts team member auth flow
 */

import { supabase } from "@/integrations/supabase/client";

export async function getAuthUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function checkTeamMembership(authUserId: string) {
  // A user is considered a team member if they have either:
  // (1) a technician record (field techs), OR
  // (2) a team_user_links row as member (managers, dispatchers, admins, etc.)
  const [techRes, linkRes] = await Promise.all([
    supabase
      .from("technicians")
      .select("id")
      .eq("auth_user_id", authUserId)
      .maybeSingle(),
    supabase
      .from("team_user_links")
      .select("id, role")
      .eq("member_user_id", authUserId)
      .maybeSingle(),
  ]);

  const data = techRes.data ?? linkRes.data ?? null;
  const error = techRes.error ?? linkRes.error ?? null;
  return { data, error };
}

export async function signInWithPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

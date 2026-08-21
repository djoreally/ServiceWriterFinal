/**
 * Team Join Query — Handles team invitation flow
 */

import { supabase } from "@/integrations/supabase/client";

export function buildTeamJoinRedirectUrl(origin: string, token?: string | null): string {
  if (!token) {
    return `${origin}/invite`;
  }

  return `${origin}/invite/${encodeURIComponent(token)}`;
}

export async function fetchTeamInvitation(token: string) {
  return supabase.rpc("get_team_invitation", { p_token: token });
}

export async function acceptTeamInvitation(token: string) {
  return supabase.rpc("accept_team_invitation", { p_invitation_token: token });
}

export async function signUpForTeam(email: string, password: string, redirectTo: string) {
  return supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: redirectTo },
  });
}

export async function signInForTeam(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function getSession() {
  return supabase.auth.getSession();
}

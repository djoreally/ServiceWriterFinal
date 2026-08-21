/**
 * Admin Login Query — Abstracts admin auth + role check
 */

import { supabase } from "@/integrations/supabase/client";
import { getSafeSignInError } from "@/application/commands/auth.command";

export async function signInAdmin(email: string, password: string) {
  const result = await supabase.auth.signInWithPassword({ email, password });
  if (!result.error) return result;
  return {
    data: result.data,
    error: new Error(getSafeSignInError(result.error)),
  };
}

export async function checkAdminRole(userId: string) {
  return supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
}

export async function signOut() {
  return supabase.auth.signOut();
}

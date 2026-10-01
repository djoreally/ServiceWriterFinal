/**
 * Admin Login Query — Abstracts admin auth + role check
 */

import { supabase } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";
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
  try {
    const { data } = await apiClient.get<{ data: { role: string } | null }>(
      `/v1/platform/admin/users/${userId}/role`,
    );
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

export async function signOut() {
  return supabase.auth.signOut();
}

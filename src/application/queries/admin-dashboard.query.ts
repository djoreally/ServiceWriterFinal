/**
 * Admin Dashboard Queries
 * Abstracts admin authentication and role verification.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
/** Get current user and verify admin role */
export async function verifyAdminAccess(): Promise<{
  isAdmin: boolean;
  email: string;
}> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return { isAdmin: false, email: "" };

  const { data: roleData, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (error || !roleData) return { isAdmin: false, email: "" };

  return { isAdmin: true, email: user.email || "" };
}

/** Sign out the current user */
export async function adminSignOut() {
  return supabase.auth.signOut();
}

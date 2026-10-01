/**
 * Admin Dashboard Queries
 * Abstracts admin authentication and role verification.
 */
import { supabase } from "@/integrations/supabase/client";

import { apiClient, ApiClientError } from "@/lib/api-client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
/** Get current user and verify admin role */
export async function verifyAdminAccess(): Promise<{
  isAdmin: boolean;
  email: string;
}> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return { isAdmin: false, email: "" };

  try {
    const result = await apiClient.get<{ isAdmin: boolean; email: string }>(
      "/v1/platform/admin/access",
    );
    return { isAdmin: result.isAdmin, email: result.email || "" };
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) {
      return { isAdmin: false, email: "" };
    }
    return { isAdmin: false, email: "" };
  }
}

/** Sign out the current user */
export async function adminSignOut() {
  return supabase.auth.signOut();
}

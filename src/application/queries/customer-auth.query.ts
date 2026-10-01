/**
 * Customer Auth Query — Read operations for the customer portal authentication.
 *
 * Auth wiring keeps the browser Supabase auth client; the account-link check
 * goes through the API boundary.
 */
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";

export async function getAuthUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function checkCustomerAccount(_userId: string): Promise<boolean> {
  try {
    const { data } = await apiClient.post<{ data: unknown[] }>("/v1/crm/customer-portal/accounts/link", {});
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

export function onAuthStateChange(callback: (event: string, session: Session | null) => void) {
  return supabase.auth.onAuthStateChange(callback);
}

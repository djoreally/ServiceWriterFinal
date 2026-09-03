/**
 * Customer Auth Query — Read operations for the customer portal authentication.
 */
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const canonicalSupabase = supabase as unknown as SupabaseClient;

export async function getAuthUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function checkCustomerAccount(_userId: string): Promise<boolean> {
  const { data, error } = await canonicalSupabase.rpc("link_customer_portal_account_v1");
  if (error) return false;
  return Array.isArray(data) && data.length > 0;
}

export function onAuthStateChange(callback: (event: string, session: Session | null) => void) {
  return supabase.auth.onAuthStateChange(callback);
}

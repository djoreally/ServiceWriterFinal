/**
 * Customer Auth Query — Read operations for the customer portal authentication.
 */
import { supabase } from "@/integrations/supabase/client";

export async function getAuthUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function checkCustomerAccount(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("customer_accounts")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  return !!data;
}

export function onAuthStateChange(callback: (event: string, session: any) => void) {
  return supabase.auth.onAuthStateChange(callback);
}

/**
 * Customer Account Commands
 * Handles customer account profile updates and password changes.
 */

import { supabase } from "@/integrations/supabase/client";

export interface CustomerAccountProfile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  user_id: string;
  provider_id: string | null;
}

export async function updateCustomerAccountProfile(
  accountId: string,
  updates: { full_name: string | null; phone: string | null }
): Promise<CustomerAccountProfile> {
  const { data, error } = await supabase
    .from("customer_accounts")
    .update(updates)
    .eq("id", accountId)
    .select()
    .single();

  if (error) throw new Error("Failed to update profile");
  return data as CustomerAccountProfile;
}

export async function changeCustomerPassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message || "Failed to change password");
}

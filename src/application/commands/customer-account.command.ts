/**
 * Customer Account Commands
 * Handles customer account profile updates and password changes.
 *
 * Password changes intentionally keep the browser Supabase auth client:
 * raw credentials must never travel through a Hono endpoint.
 */

import { supabase } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";

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
  const { data } = await apiClient.patch<{ data: CustomerAccountProfile }>("/v1/crm/customer-portal/account", {
    account_id: accountId,
    full_name: updates.full_name,
    phone: updates.phone,
  });
  return data;
}

export async function changeCustomerPassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message || "Failed to change password");
}

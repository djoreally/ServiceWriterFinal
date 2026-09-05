/**
 * Customer Account Commands — canonical customer identity/profile updates.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const canonicalSupabase = supabase as unknown as SupabaseClient;

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
  updates: { full_name: string | null; phone: string | null },
): Promise<CustomerAccountProfile> {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error("Not authenticated");

  const linked = await canonicalSupabase.rpc("link_customer_portal_account_v1");
  if (linked.error) throw new Error(linked.error.message);
  const link = ((linked.data ?? []) as Array<{ customer_id: string; workspace_id: string }>).find(
    (row) => row.customer_id === accountId,
  );
  if (!link) throw new Error("Customer profile is not linked to this account");

  const parts = (updates.full_name ?? "").trim().split(/\s+/).filter(Boolean);
  const firstName = parts.shift() ?? "";
  const lastName = parts.join(" ");
  const { data, error } = await canonicalSupabase
    .from("customers")
    .update({ first_name: firstName, last_name: lastName, phone: updates.phone })
    .eq("id", link.customer_id)
    .eq("workspace_id", link.workspace_id)
    .select("id,email,phone,first_name,last_name")
    .single();
  if (error) throw new Error("Failed to update profile");

  const row = data as {
    id: string;
    email: string | null;
    phone: string | null;
    first_name: string | null;
    last_name: string | null;
  };
  return {
    id: row.id,
    email: row.email ?? user.email ?? "",
    full_name: [row.first_name, row.last_name].filter(Boolean).join(" ") || null,
    phone: row.phone,
    user_id: user.id,
    provider_id: null,
  };
}

export async function changeCustomerPassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message || "Failed to change password");
}

/** Customer portal identity and canonical loyalty experience. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";

const canonicalSupabase = supabase as unknown as SupabaseClient;

export interface CustomerAccountData {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  user_id: string;
  provider_id: string | null;
  workspace_id?: string | null;
}

export interface CustomerPortalLoyaltyAccount {
  id: string;
  workspace_id: string;
  customer_id: string;
  current_points: number;
  enrolled_at: string;
  updated_at: string;
}

export interface CustomerPortalLedgerEvent {
  id: string;
  account_id: string;
  workspace_id: string;
  customer_id: string;
  points_delta: number;
  reason: string;
  source_type: string | null;
  source_id: string | null;
  created_at: string;
}

export interface CustomerPortalExperience {
  completedServices: number;
  totalSpent: number;
  rewardPoints: number;
  accounts: CustomerPortalLoyaltyAccount[];
  ledger: CustomerPortalLedgerEvent[];
  dashboardStatus: "active" | "not_enrolled";
}

export async function fetchCustomerAccount(): Promise<CustomerAccountData | null> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return null;

  const linked = await canonicalSupabase.rpc("link_customer_portal_account_v1");
  if (linked.error) {
    console.error("[fetchCustomerAccount] link rpc error", linked.error);
    return null;
  }

  const links = (linked.data ?? []) as Array<{ customer_id: string; workspace_id: string }>;
  const link = links[0];
  if (!link) return null;

  const { data: customer, error } = await canonicalSupabase
    .from("customers")
    .select("id,workspace_id,first_name,last_name,email,phone")
    .eq("id", link.customer_id)
    .eq("workspace_id", link.workspace_id)
    .maybeSingle();
  if (error || !customer) return null;

  const row = customer as { id: string; workspace_id: string; first_name: string; last_name: string; email: string | null; phone: string | null };
  return {
    id: row.id,
    email: row.email ?? user.email ?? "",
    full_name: [row.first_name, row.last_name].filter(Boolean).join(" ") || user.user_metadata?.full_name || null,
    phone: row.phone ?? (typeof user.user_metadata?.phone === "string" ? user.user_metadata.phone : null),
    user_id: user.id,
    provider_id: null,
    workspace_id: row.workspace_id,
  };
}

export function onAuthStateChange(callback: (event: string) => void) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => callback(event));
  return () => subscription.unsubscribe();
}

export async function customerSignOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function fetchCustomerPortalExperience(_account: CustomerAccountData): Promise<CustomerPortalExperience> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return { completedServices: 0, totalSpent: 0, rewardPoints: 0, accounts: [], ledger: [], dashboardStatus: "not_enrolled" };

  const { data, error } = await canonicalSupabase.rpc("get_customer_portal_rewards_v1");
  if (error) throw new Error(error.message);
  const result = (data ?? {}) as {
    status?: "active" | "not_enrolled";
    completed_services?: number;
    total_spent?: number;
    points_balance?: number;
    accounts?: CustomerPortalLoyaltyAccount[];
    ledger?: CustomerPortalLedgerEvent[];
  };
  return {
    completedServices: Number(result.completed_services ?? 0),
    totalSpent: Number(result.total_spent ?? 0),
    rewardPoints: Number(result.points_balance ?? 0),
    accounts: result.accounts ?? [],
    ledger: result.ledger ?? [],
    dashboardStatus: result.status ?? "not_enrolled",
  };
}

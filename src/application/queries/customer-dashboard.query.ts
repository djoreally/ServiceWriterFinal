/** Customer portal identity and canonical loyalty experience. */
import { supabase } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";

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

  try {
    const { data } = await apiClient.get<{ data: CustomerAccountData | null }>("/v1/crm/customer-portal/account");
    return data;
  } catch (error) {
    console.error("[fetchCustomerAccount] link rpc error", error);
    return null;
  }
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

  const { data } = await apiClient.get<{ data: CustomerPortalExperience }>("/v1/crm/customer-portal/experience");
  return data;
}

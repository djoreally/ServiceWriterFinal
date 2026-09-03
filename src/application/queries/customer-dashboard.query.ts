/**
 * Customer Dashboard Query - Fetch customer account and handle auth state for customer portal.
 */
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

/**
 * Fetch the current canonical customer identity. The legacy customer_accounts
 * table has been retired; customer_users is the authenticated linkage table.
 */
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
  const row = customer as {
    id: string;
    workspace_id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
  };

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

/** Subscribe to auth state changes. Returns unsubscribe function. */
export function onAuthStateChange(callback: (event: string) => void) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
    callback(event);
  });
  return () => subscription.unsubscribe();
}

/** Sign out from customer portal. */
export async function customerSignOut(): Promise<void> {
  await supabase.auth.signOut();
}

export interface CustomerPortalCoupon {
  id: string;
  code: string;
  description: string | null;
  discount_type: string;
  discount_value: number;
  min_order_amount: number | null;
  valid_until: string | null;
}

export interface CustomerPortalReward {
  id: string;
  name: string;
  description: string | null;
  points_required: number;
  reward_type: string;
  program_name: string | null;
}

export interface CustomerPortalLoyaltyAccount {
  id: string;
  program_id: string;
  program_name: string | null;
  points_balance: number;
  lifetime_points_earned: number;
  lifetime_spend_cents: number;
  visit_count: number;
  tier: string;
  status: string;
  updated_at: string;
}

export interface CustomerPortalIssuedReward {
  id: string;
  reward_id: string;
  reward_name: string;
  reward_description: string | null;
  reward_type: string;
  program_id: string;
  program_name: string | null;
  status: string;
  issued_at: string;
  expires_at: string | null;
  reserved_at: string | null;
  applied_at: string | null;
  redeemed_at: string | null;
  discount_cents: number;
  appointment_id: string | null;
}

export interface CustomerPortalLedgerEvent {
  id: string;
  account_id: string;
  program_id: string;
  program_name: string | null;
  appointment_id: string | null;
  event_type: string;
  points_delta: number;
  credit_delta_cents: number;
  balance_after: number | null;
  occurred_at: string;
  created_at: string;
}

export interface CustomerPortalExperience {
  completedServices: number;
  totalSpent: number;
  rewardPoints: number;
  lifetimePointsEarned: number;
  accounts: CustomerPortalLoyaltyAccount[];
  issuedRewards: CustomerPortalIssuedReward[];
  ledger: CustomerPortalLedgerEvent[];
  nextReward: CustomerPortalReward | null;
  rewards: CustomerPortalReward[];
  coupons: CustomerPortalCoupon[];
  phoneCouponHint: string | null;
  dashboardStatus: string;
}

/**
 * Rewards are kept failure-isolated while their legacy provider-id contract is
 * migrated. Core customer identity and appointments must never depend on it.
 */
export async function fetchCustomerPortalExperience(account: CustomerAccountData): Promise<CustomerPortalExperience> {
  const providerId = account.provider_id;
  if (!providerId) {
    return {
      completedServices: 0,
      totalSpent: 0,
      rewardPoints: 0,
      lifetimePointsEarned: 0,
      accounts: [],
      issuedRewards: [],
      ledger: [],
      nextReward: null,
      rewards: [],
      coupons: [],
      phoneCouponHint: null,
      dashboardStatus: "rewards_migration_pending",
    };
  }

  const today = new Date().toISOString();
  const [dashboardRes, couponsRes] = await Promise.all([
    supabase.rpc("get_customer_rewards_dashboard", { p_customer_account_id: account.id }),
    supabase
      .from("coupon_codes")
      .select("id, code, description, discount_type, discount_value, min_order_amount, valid_until")
      .eq("user_id", providerId)
      .eq("is_active", true)
      .or(`valid_until.is.null,valid_until.gte.${today}`)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  if (dashboardRes.error) throw new Error(dashboardRes.error.message);

  const dashboard = (dashboardRes.data || {}) as {
    status?: string;
    summary?: {
      points_balance?: number;
      lifetime_points_earned?: number;
      lifetime_spend_cents?: number;
      visit_count?: number;
    };
    accounts?: CustomerPortalLoyaltyAccount[];
    issued_rewards?: CustomerPortalIssuedReward[];
    ledger?: CustomerPortalLedgerEvent[];
    catalog?: CustomerPortalReward[];
  };

  const rewards = (dashboard.catalog || []).map((reward) => ({
    id: String(reward.id),
    name: String(reward.name),
    description: reward.description ?? null,
    points_required: Number(reward.points_required || 0),
    reward_type: String(reward.reward_type || "reward"),
    program_name: reward.program_name ?? null,
  }));
  const rewardPoints = Number(dashboard.summary?.points_balance || 0);

  return {
    completedServices: Number(dashboard.summary?.visit_count || 0),
    totalSpent: Number(dashboard.summary?.lifetime_spend_cents || 0) / 100,
    rewardPoints,
    lifetimePointsEarned: Number(dashboard.summary?.lifetime_points_earned || 0),
    accounts: dashboard.accounts || [],
    issuedRewards: dashboard.issued_rewards || [],
    ledger: dashboard.ledger || [],
    nextReward: rewards.find((reward) => reward.points_required > rewardPoints) ?? rewards[0] ?? null,
    rewards,
    coupons: (couponsRes.data || []) as CustomerPortalCoupon[],
    phoneCouponHint: null,
    dashboardStatus: dashboard.status || "ok",
  };
}

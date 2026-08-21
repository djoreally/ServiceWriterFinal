/**
 * Customer Dashboard Query - Fetch customer account and handle auth state for customer portal.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface CustomerAccountData {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  user_id: string;
  provider_id: string | null;
}

/** Fetch the current customer account. Returns null if not found. */
export async function fetchCustomerAccount(): Promise<CustomerAccountData | null> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("customer_accounts")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) return null;
  return data as CustomerAccountData;
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
 * Fetch customer-facing rewards and offers for the portal. This is intentionally
 * best-effort so the dashboard still loads even if a provider has not enabled
 * loyalty programs or coupons yet.
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
      dashboardStatus: "no_provider",
    };
  }

  const today = new Date().toISOString();

  const [dashboardRes, couponsRes, profileRes] = await Promise.all([
    supabase.rpc("get_customer_rewards_dashboard", { p_customer_account_id: account.id }),
    supabase
      .from("coupon_codes")
      .select("id, code, description, discount_type, discount_value, min_order_amount, valid_until")
      .eq("user_id", providerId)
      .eq("is_active", true)
      .or(`valid_until.is.null,valid_until.gte.${today}`)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("business_profiles")
      .select("phone_as_coupon_enabled, phone_coupon_description")
      .eq("user_id", providerId)
      .maybeSingle(),
  ]);

  if (dashboardRes.error) {
    throw new Error(dashboardRes.error.message);
  }

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
    coupons: ((couponsRes.data || []) as CustomerPortalCoupon[]),
    phoneCouponHint: profileRes.data?.phone_as_coupon_enabled
      ? profileRes.data.phone_coupon_description || "Use your phone number as a loyalty coupon at checkout."
      : null,
    dashboardStatus: dashboard.status || "ok",
  };
}

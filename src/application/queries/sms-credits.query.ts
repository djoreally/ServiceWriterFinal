/**
 * SMS Credits Query — prepaid message credit balance, bundle catalog,
 * and purchase history for the Messaging settings card.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface SmsCreditBalance {
  included_units: number;
  purchased_units: number;
  used_units: number;
  reserved_units: number;
  available: number;
  period_start: string | null;
  period_end: string | null;
  low_balance_threshold: number;
  transactional_enabled: boolean;
  marketing_enabled: boolean;
}

export interface SmsBundle {
  bundle_key: string;
  name: string;
  credit_units: number;
  price_cents: number;
  renewal_period: string;
}

export interface SmsCreditPurchase {
  id: string;
  bundle_key: string;
  units: number;
  kind: string;
  amount_cents: number | null;
  created_at: string;
}

const EMPTY_BALANCE: SmsCreditBalance = {
  included_units: 0,
  purchased_units: 0,
  used_units: 0,
  reserved_units: 0,
  available: 0,
  period_start: null,
  period_end: null,
  low_balance_threshold: 50,
  transactional_enabled: true,
  marketing_enabled: false,
};

export async function fetchSmsCreditBalance(): Promise<SmsCreditBalance> {
  const { data: userData } = await getCurrentAuthUser();
  const uid = userData.user?.id;
  if (!uid) return EMPTY_BALANCE;
  const { data, error } = await supabase.rpc("sms_credit_balance_v1", { p_user_id: uid });
  if (error) throw error;
  return { ...EMPTY_BALANCE, ...((data ?? {}) as Partial<SmsCreditBalance>) };
}

export async function fetchSmsBundles(): Promise<SmsBundle[]> {
  const { data, error } = await supabase
    .from("message_bundles")
    .select("bundle_key, name, credit_units, price_cents, renewal_period")
    .eq("channel", "sms")
    .eq("is_active", true)
    .not("bundle_key", "is", null)
    .order("price_cents", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SmsBundle[];
}

export async function fetchSmsCreditPurchases(): Promise<SmsCreditPurchase[]> {
  const { data, error } = await supabase
    .from("sms_credit_purchases")
    .select("id, bundle_key, units, kind, amount_cents, created_at")
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw error;
  return (data ?? []) as SmsCreditPurchase[];
}

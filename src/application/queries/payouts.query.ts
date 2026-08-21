import { SUPABASE_PROJECT_ID_RESOLVED, SUPABASE_PUBLISHABLE_KEY_RESOLVED } from "@/integrations/supabase/client";
/**
 * Payouts Query — Abstracts Stripe payouts edge function
 */

import { supabase } from "@/integrations/supabase/client";

const PROJECT_ID = SUPABASE_PROJECT_ID_RESOLVED;
const FN_BASE = `https://${PROJECT_ID}.supabase.co/functions/v1/stripe-payouts`;

async function authedGet(path = "") {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const res = await fetch(`${FN_BASE}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: SUPABASE_PUBLISHABLE_KEY_RESOLVED,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed (${res.status})`);
  }
  return res.json();
}

export async function fetchPayoutsData() {
  return authedGet();
}

export async function fetchInstantPayoutBalance() {
  return authedGet("?action=balance");
}

export async function fetchInstantPayoutEligibility() {
  return authedGet("?action=eligibility");
}

/**
 * Trigger an instant payout for the connected Stripe account.
 * Pass `amount` (in cents) to pay out a specific amount; omit to pay out the full
 * available balance. Currency defaults to the account's first available currency.
 */
export async function triggerInstantPayout(opts?: { amount?: number; currency?: string }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in");

  const response = await supabase.functions.invoke("stripe-payouts", {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: opts ?? {},
  });

  if (response.error) {
    const apiError = (response.data as any)?.error || response.error.message || "Payout failed";
    throw new Error(apiError);
  }

  const data = response.data as {
    success: boolean;
    noFunds?: boolean;
    error?: string;
    availableAmount?: number;
    currency?: string;
    payout?: {
      id: string;
      amount: number;
      currency: string;
      status: string;
      method: string;
      arrivalDate: number;
    };
  };

  return data;
}

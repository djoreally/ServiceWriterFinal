/**
 * Stripe Connect Query — Standard Accounts
 *
 * Fetches Stripe Connect status and initiates onboarding via Edge Functions.
 * Supports both "create" (new Standard account) and "oauth" (connect existing) modes.
 */

import { supabase } from "@/integrations/supabase/client";

export interface StripeConnectStatus {
  connected: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  accountId?: string;
  /** ⚡ Standard accounts return "standard"; legacy Express returns "express" */
  accountType?: string;
}

export async function fetchStripeConnectStatus(): Promise<StripeConnectStatus> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const response = await supabase.functions.invoke("stripe-connect-status", {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (response.error) throw response.error;
  return response.data;
}

/**
 * Start Stripe Connect onboarding.
 * @param mode "create" = new Standard account + Account Link, "oauth" = connect existing account
 */
export async function startStripeConnectOnboarding(mode: "create" | "oauth" = "create"): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Please sign in to connect Stripe");

  const response = await supabase.functions.invoke("stripe-connect-onboard", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: { mode },
  });

  if (response.error) throw new Error(response.error.message || "Failed to start Stripe onboarding");
  if (!response.data?.url) throw new Error("No onboarding URL received");

  return response.data.url;
}

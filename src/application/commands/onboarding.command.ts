/**
 * Onboarding Commands - Stripe payment setup during onboarding.
 */

import { supabase } from "@/integrations/supabase/client";

export interface StripeOnboardingStatus {
  connected: boolean;
  chargesEnabled: boolean;
}

/**
 * Check Stripe Connect status for the current user.
 */
export async function checkStripeOnboardingStatus(): Promise<StripeOnboardingStatus> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { connected: false, chargesEnabled: false };

  const response = await supabase.functions.invoke("stripe-connect-status", {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (response.error) throw response.error;
  return {
    connected: !!response.data?.connected,
    chargesEnabled: !!response.data?.chargesEnabled,
  };
}

/**
 * Start Stripe Connect onboarding — returns the redirect URL.
 */
export async function startStripeOnboarding(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Please sign in to connect Stripe");

  const response = await supabase.functions.invoke("stripe-connect-onboard", {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (response.error) throw new Error(response.error.message || "Failed to start Stripe onboarding");
  if (!response.data?.url) throw new Error("No onboarding URL returned");
  return response.data.url;
}

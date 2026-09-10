/** Onboarding Commands - Stripe payment setup during onboarding. */
import { fetchPaymentProvider } from "@/application/queries/payment-provider.query";
import { initiateStripeOnboarding, refreshStripeConnection } from "@/application/commands/payment-provider.command";

export interface StripeOnboardingStatus {
  connected: boolean;
  chargesEnabled: boolean;
}

export async function checkStripeOnboardingStatus(): Promise<StripeOnboardingStatus> {
  try { await refreshStripeConnection(); } catch { /* Reconnection may be required. */ }
  const status = await fetchPaymentProvider();
  return {
    connected: status?.stripeStatus.connected ?? false,
    chargesEnabled: status?.stripeStatus.chargesEnabled ?? false,
  };
}

export async function startStripeOnboarding(): Promise<string> {
  const response = await initiateStripeOnboarding();
  if (!response.data?.url) throw new Error("Stripe did not return an onboarding URL");
  return response.data.url;
}

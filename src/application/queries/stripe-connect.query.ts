/** Stripe connection compatibility adapter — delegates to the canonical provider domain. */
import { fetchPaymentProvider } from "@/application/queries/payment-provider.query";
import { initiateStripeOnboarding, refreshStripeConnection } from "@/application/commands/payment-provider.command";

export interface StripeConnectStatus {
  connected: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  accountId?: string;
  accountType?: string;
}

export async function fetchStripeConnectStatus(): Promise<StripeConnectStatus> {
  try {
    await refreshStripeConnection();
  } catch {
    // Status read still comes from the canonical connection ledger. A provider
    // refresh can fail when Stripe needs reconnection; callers see connected=false.
  }
  const result = await fetchPaymentProvider();
  if (!result) return { connected: false, chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false };
  return result.stripeStatus;
}

/** Start the canonical Stripe connection flow. */
export async function startStripeConnectOnboarding(_mode: "create" | "oauth" = "create"): Promise<string> {
  const response = await initiateStripeOnboarding();
  if (!response.data?.url) throw new Error("Stripe did not return an onboarding URL");
  return response.data.url;
}

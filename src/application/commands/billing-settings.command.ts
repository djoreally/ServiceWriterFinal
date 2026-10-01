/**
 * Billing Settings Commands — Stripe checkout for messaging add-ons.
 */
import { apiClient, ApiClientError } from "@/lib/api-client";

export async function startMessagingAddonCheckout(bundleKey: string): Promise<{ url?: string }> {
  try {
    return await apiClient.post<{ url?: string }>("/v1/billing/messaging-addon-checkout", {
      bundle_key: bundleKey,
    });
  } catch (error) {
    throw new Error(error instanceof ApiClientError ? error.message : "Failed to start checkout");
  }
}

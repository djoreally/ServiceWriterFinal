import { apiClient, ApiClientError } from "@/lib/api-client";

export interface StripeDirectStatus {
  mode: "connect" | "direct";
  configured: boolean;
  accountId: string | null;
  keyLast4: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  webhookConfigured: boolean;
  checkedAt: string | null;
}

function toError(error: unknown, fallback: string): Error {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return new Error("Please sign in to manage Stripe");
    if (error.code === "workspace_missing") return new Error("No active workspace");
    return new Error(error.message);
  }
  return new Error(fallback);
}

export async function fetchStripeDirectStatus(): Promise<StripeDirectStatus> {
  try {
    // Workspace is resolved server-side from the auth token; it is never
    // passed from the client.
    const { data } = await apiClient.get<{ data: StripeDirectStatus }>("/v1/payments/stripe-direct");
    return data;
  } catch (error) {
    throw toError(error, "Stripe configuration request failed");
  }
}

export async function configureStripeDirect(accountId: string, secretKey: string, webhookSecret: string): Promise<StripeDirectStatus> {
  try {
    const { data } = await apiClient.put<{ data: StripeDirectStatus }>("/v1/payments/stripe-direct", {
      account_id: accountId,
      secret_key: secretKey,
      webhook_secret: webhookSecret,
    });
    return data;
  } catch (error) {
    throw toError(error, "Stripe configuration request failed");
  }
}

export async function disconnectStripeDirect(): Promise<StripeDirectStatus> {
  try {
    const { data } = await apiClient.delete<{ data: StripeDirectStatus }>("/v1/payments/stripe-direct");
    return data;
  } catch (error) {
    throw toError(error, "Stripe configuration request failed");
  }
}

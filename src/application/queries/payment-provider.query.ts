/** Payment Provider Query — canonical workspace-scoped provider settings via the Hono billing API. */
import { apiClient, ApiClientError } from "@/lib/api-client";

export interface PaymentProviderStatus {
  provider: string;
  stripeStatus: {
    connected: boolean;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    accountId?: string;
  };
  squareStatus: {
    connected: boolean;
    chargesEnabled: boolean;
    merchantId: string | null;
    locationId: string | null;
    onboardingComplete: boolean;
    accountStatus?: string;
    tokenExpiringSoon: boolean;
  };
}

export async function fetchPaymentProvider(): Promise<PaymentProviderStatus | null> {
  try {
    const { data } = await apiClient.get<{ data: PaymentProviderStatus }>("/v1/billing/payment-provider");
    return data;
  } catch (error) {
    if (error instanceof ApiClientError && error.code === "workspace_missing") return null;
    throw error instanceof ApiClientError ? new Error(error.message) : error;
  }
}

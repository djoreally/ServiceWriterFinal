/**
 * Stripe Payment Methods Mirror — read-only view of capabilities on a
 * connected Stripe Standard account. The platform cannot toggle these;
 * shops manage them in the Stripe Dashboard. Served via the Hono billing API.
 */
import { apiClient, ApiClientError } from "@/lib/api-client";

export type MethodStatus = "active" | "pending" | "inactive" | "unrequested";

export interface PaymentMethodMirror {
  key: string;
  label: string;
  status: MethodStatus;
}

export interface PaymentMethodMirrorResponse {
  connected: boolean;
  accountId?: string;
  accountType?: string;
  chargesEnabled?: boolean;
  detailsSubmitted?: boolean;
  methods: PaymentMethodMirror[];
}

export interface ShopPaymentMethodSummary {
  userId: string;
  businessName: string | null;
  accountId: string | null;
  chargesEnabled?: boolean;
  detailsSubmitted?: boolean;
  methods: PaymentMethodMirror[];
  error?: string;
}

function toError(error: unknown): Error {
  if (error instanceof ApiClientError && error.status === 401) return new Error("Not authenticated");
  return new Error(error instanceof ApiClientError ? error.message : "Payment methods request failed");
}

export async function fetchOwnPaymentMethodMirror(): Promise<PaymentMethodMirrorResponse> {
  try {
    return await apiClient.post<PaymentMethodMirrorResponse>("/v1/billing/stripe-payment-methods", {
      mode: "self",
    });
  } catch (error) {
    throw toError(error);
  }
}

export async function fetchAllShopPaymentMethods(): Promise<ShopPaymentMethodSummary[]> {
  try {
    const data = await apiClient.post<{ shops?: ShopPaymentMethodSummary[] }>("/v1/billing/stripe-payment-methods", {
      mode: "list",
    });
    return data?.shops || [];
  } catch (error) {
    throw toError(error);
  }
}

/** Deep-link a shop owner to the payment methods settings in the Stripe Dashboard. */
export function stripePaymentMethodsDashboardUrl(): string {
  return "https://dashboard.stripe.com/settings/payment_methods";
}

/**
 * Stripe Payment Methods Mirror — read-only view of capabilities on a
 * connected Stripe Standard account. The platform cannot toggle these;
 * shops manage them in the Stripe Dashboard.
 */
import { supabase } from "@/integrations/supabase/client";

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

async function authedHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  return { Authorization: `Bearer ${session.access_token}` };
}

export async function fetchOwnPaymentMethodMirror(): Promise<PaymentMethodMirrorResponse> {
  const headers = await authedHeaders();
  const { data, error } = await supabase.functions.invoke("stripe-connect-payment-methods", {
    headers,
    body: { mode: "self" },
  });
  if (error) throw error;
  return data as PaymentMethodMirrorResponse;
}

export async function fetchAllShopPaymentMethods(): Promise<ShopPaymentMethodSummary[]> {
  const headers = await authedHeaders();
  const { data, error } = await supabase.functions.invoke("stripe-connect-payment-methods", {
    headers,
    body: { mode: "list" },
  });
  if (error) throw error;
  return (data?.shops || []) as ShopPaymentMethodSummary[];
}

/** Deep-link a shop owner to the payment methods settings in the Stripe Dashboard. */
export function stripePaymentMethodsDashboardUrl(): string {
  return "https://dashboard.stripe.com/settings/payment_methods";
}

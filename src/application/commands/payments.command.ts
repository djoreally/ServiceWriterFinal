import { SUPABASE_PUBLISHABLE_KEY_RESOLVED, SUPABASE_URL_RESOLVED, supabase } from "@/integrations/supabase/client";
import {
  parseEdgeFunctionResponse,
  stripeRefundResponseSchema,
  sendInvoiceResponseSchema,
  paymentLinkResponseSchema,
  manualPaymentResponseSchema,
  type PaymentLinkResponse,
} from "@/lib/edge-function-schemas";

export interface RefundPaymentRequest {
  paymentId: string;
  amountCents: number;
  reason?: string;
}

export interface PaymentLinkRequest {
  paymentId: string;
  amountCents: number;
  customerEmail: string;
  customerName: string | null;
  description: string;
}

export interface PaymentLinkResult {
  url?: string | null;
  message?: string | null;
}

export interface ManualPaymentRequest {
  paymentId: string;
  amountCents: number;
  paymentMethod: string;
  notes?: string;
  waiveFees?: boolean;
  waiveTax?: boolean;
  waiveRemaining?: boolean;
}

/**
 * Issue a refund for a payment via Stripe edge function.
 */
export async function refundPayment(
  request: RefundPaymentRequest,
): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase.functions.invoke("stripe-refund", {
    body: {
      payment_id: request.paymentId,
      amount: request.amountCents,
      reason: request.reason,
    },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (error) {
    console.error("[refundPayment] Edge function error", error);
    throw new Error("Failed to process refund");
  }

  // ⚡ Validated parse — replaces unsafe `(data as any)` cast
  parseEdgeFunctionResponse(stripeRefundResponseSchema, data);
}

/**
 * Send or resend an invoice email for a payment.
 */
export async function sendInvoiceForPayment(paymentId: string): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase.functions.invoke("send-invoice", {
    body: { payment_id: paymentId },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (error) {
    console.error("[sendInvoiceForPayment] Edge function error", error);
    throw new Error("Failed to send invoice");
  }

  parseEdgeFunctionResponse(sendInvoiceResponseSchema, data);
}

/**
 * Create and optionally email a payment link for an invoice.
 */
export async function sendPaymentLink(
  request: PaymentLinkRequest,
): Promise<PaymentLinkResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase.functions.invoke(
    "create-invoice-payment-link",
    {
      body: {
        payment_id: request.paymentId,
        amount: request.amountCents,
        customer_email: request.customerEmail,
        customer_name: request.customerName,
        description: request.description,
      },
      headers: { Authorization: `Bearer ${session.access_token}` },
    },
  );

  if (error) {
    console.error("[sendPaymentLink] Edge function error", error);
    throw new Error("Failed to send payment link");
  }

  const parsed = parseEdgeFunctionResponse(paymentLinkResponseSchema, data);

  return {
    url: parsed.url ?? null,
    message: parsed.message ?? null,
  };
}

/**
 * Record a manual/offline payment for an existing payment record.
 *
 * Uses direct fetch (not supabase.functions.invoke) so the actionable JSON
 * error body returned by the edge function reaches the toast — invoke()
 * swallows the body and only surfaces a generic FunctionsHttpError.
 */
export async function recordManualPayment(
  request: ManualPaymentRequest,
): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Not authenticated");
  }

  const url = `${SUPABASE_URL_RESOLVED}/functions/v1/record-manual-payment`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: SUPABASE_PUBLISHABLE_KEY_RESOLVED,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      payment_id: request.paymentId,
      amount: request.amountCents,
      payment_method: request.paymentMethod,
      notes: request.notes,
      waive_fees: request.waiveFees,
      waive_tax: request.waiveTax,
      waive_remaining: request.waiveRemaining,
    }),
  });

  const json = await res.json().catch(() => ({} as Record<string, unknown>));

  if (!res.ok) {
    const message =
      (typeof json.error === "string" && json.error) ||
      `Failed to record payment (HTTP ${res.status})`;
    console.error("[recordManualPayment] Edge function error", { status: res.status, body: json });
    throw new Error(message);
  }

  parseEdgeFunctionResponse(manualPaymentResponseSchema, json);
}

/**
 * Ensure a checkout session has been verified and a booking created.
 * Used by the public payment success page before polling.
 */
export async function ensureBookingPaymentVerified(
  sessionId: string,
): Promise<void> {
  try {
    await supabase.functions.invoke("verify-booking-payment", {
      body: { session_id: sessionId },
    });
  } catch (error) {
    console.warn("[ensureBookingPaymentVerified] verify-booking-payment failed", error);
  }
}

import { supabase } from "@/integrations/supabase/client";
import { nextApi } from "@/lib/nextApiClient";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";
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
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error("Select a workspace before processing a refund.");
  const { data } = await nextApi.payments.action({ action: "refund", workspace_id, payment_id: request.paymentId, amount: request.amountCents, reason: request.reason });

  // ⚡ Validated parse — replaces unsafe `(data as any)` cast
  parseEdgeFunctionResponse(stripeRefundResponseSchema, data);
}

/**
 * Send or resend an invoice email for a payment.
 */
export async function sendInvoiceForPayment(paymentId: string): Promise<void> {
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error("Select a workspace before sending an invoice.");
  const { data } = await nextApi.payments.action({ action: "send_invoice", workspace_id, payment_id: paymentId });

  parseEdgeFunctionResponse(sendInvoiceResponseSchema, data);
}

/**
 * Create and optionally email a payment link for an invoice.
 */
export async function sendPaymentLink(
  request: PaymentLinkRequest,
): Promise<PaymentLinkResult> {
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error("Select a workspace before creating a payment link.");
  const { data } = await nextApi.payments.action({ action: "payment_link", workspace_id, payment_id: request.paymentId, amount: request.amountCents, customer_email: request.customerEmail, customer_name: request.customerName, description: request.description });

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
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error("Select a workspace before recording a payment.");
  const { data } = await nextApi.payments.action({ action: "manual_payment", workspace_id, payment_id: request.paymentId, amount: request.amountCents, payment_method: request.paymentMethod, notes: request.notes, waive_fees: request.waiveFees, waive_tax: request.waiveTax, waive_remaining: request.waiveRemaining });
  parseEdgeFunctionResponse(manualPaymentResponseSchema, data);
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

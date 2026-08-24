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

/** Refund requests use the Next.js provider boundary. */
export async function refundPayment(
  request: RefundPaymentRequest,
): Promise<void> {
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error("Select a workspace before processing a refund.");
  const { data } = await nextApi.payments.action({ action: "refund", workspace_id, payment_id: request.paymentId, amount: request.amountCents, reason: request.reason });
  parseEdgeFunctionResponse(stripeRefundResponseSchema, data);
}

/** Send/resend requests use the Next.js provider boundary. */
export async function sendInvoiceForPayment(paymentId: string): Promise<void> {
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error("Select a workspace before sending an invoice.");
  const { data } = await nextApi.payments.action({ action: "send_invoice", workspace_id, payment_id: paymentId });
  parseEdgeFunctionResponse(sendInvoiceResponseSchema, data);
}

/** Create a provider payment link when a provider is configured. */
export async function sendPaymentLink(
  request: PaymentLinkRequest,
): Promise<PaymentLinkResult> {
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error("Select a workspace before creating a payment link.");
  const { data } = await nextApi.payments.action({ action: "payment_link", workspace_id, payment_id: request.paymentId, amount: request.amountCents, customer_email: request.customerEmail, customer_name: request.customerName, description: request.description });
  const parsed = parseEdgeFunctionResponse(paymentLinkResponseSchema, data);
  return { url: parsed.url ?? null, message: parsed.message ?? null };
}

/** Record a manual/offline payment through Final's canonical API. */
export async function recordManualPayment(
  request: ManualPaymentRequest,
): Promise<void> {
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error("Select a workspace before recording a payment.");
  const { data } = await nextApi.payments.action({ action: "manual_payment", workspace_id, payment_id: request.paymentId, amount: request.amountCents, payment_method: request.paymentMethod, notes: request.notes, waive_fees: request.waiveFees, waive_tax: request.waiveTax, waive_remaining: request.waiveRemaining });
  parseEdgeFunctionResponse(manualPaymentResponseSchema, data);
}

/**
 * Final has no checkout-verification provider runtime yet. The payment-success
 * page therefore reads only payment rows already present in the canonical
 * ledger instead of invoking a retired Lovable Edge Function.
 */
export async function ensureBookingPaymentVerified(_sessionId: string): Promise<void> {
  return;
}

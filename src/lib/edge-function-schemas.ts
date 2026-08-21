/**
 * ⚡ Zod schemas for Stripe edge function responses.
 *
 * Eliminates `as any` casts on the most critical payment flows
 * by validating every edge-function response at the boundary.
 */
import { z } from "zod";

// ── Shared base: every edge function may return { error: string } ────

const edgeFunctionErrorShape = z.object({ error: z.string() });

// ── stripe-refund ────────────────────────────────────────────────────

export const stripeRefundResponseSchema = z.object({
  success: z.literal(true),
  refund_id: z.string(),
  amount_refunded: z.number(),
  total_refunded: z.number(),
  status: z.string(),
});

export type StripeRefundResponse = z.infer<typeof stripeRefundResponseSchema>;

// ── send-invoice ─────────────────────────────────────────────────────

export const sendInvoiceResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
});

export type SendInvoiceResponse = z.infer<typeof sendInvoiceResponseSchema>;

// ── create-invoice-payment-link ──────────────────────────────────────

export const paymentLinkResponseSchema = z.object({
  url: z.string().url().nullable().optional(),
  message: z.string().nullable().optional(),
});

export type PaymentLinkResponse = z.infer<typeof paymentLinkResponseSchema>;

// ── record-manual-payment ────────────────────────────────────────────

export const manualPaymentResponseSchema = z.object({
  success: z.literal(true),
  amount_paid: z.number().optional(),
  waived_fees: z.boolean().optional(),
  waived_tax: z.boolean().optional(),
  message: z.string().optional(),
});

export type ManualPaymentResponse = z.infer<typeof manualPaymentResponseSchema>;

// ── verify-booking-payment ───────────────────────────────────────────

export const verifyBookingPaymentResponseSchema = z.object({
  success: z.literal(true).optional(),
  booking_id: z.string().optional(),
});

export type VerifyBookingPaymentResponse = z.infer<typeof verifyBookingPaymentResponseSchema>;

// ── Generic parser ───────────────────────────────────────────────────

/**
 * Validates an edge-function response against a Zod schema.
 *
 * 1. If the raw payload contains an `error` string field the function
 *    throws immediately — this covers the `{ error: "…" }` convention
 *    used by all our edge functions.
 * 2. Otherwise the payload is parsed with the provided success schema.
 *    A ZodError is converted into a human-readable message so callers
 *    get a clear indication of contract drift.
 *
 * ⚡ Perf: Zod `.safeParse` avoids throwing + catching internally
 *    when the happy path succeeds, keeping the hot path allocation-free.
 */
export function parseEdgeFunctionResponse<T>(
  schema: z.ZodType<T>,
  data: unknown,
): T {
  // Check for the universal error envelope first
  const errorResult = edgeFunctionErrorShape.safeParse(data);
  if (errorResult.success) {
    throw new Error(errorResult.data.error);
  }

  // Validate against the expected success shape
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error(
      "[parseEdgeFunctionResponse] Schema validation failed",
      result.error.flatten(),
    );
    throw new Error("Unexpected response from server");
  }

  return result.data;
}

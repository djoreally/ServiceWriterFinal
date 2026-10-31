/**
 * Server-side quote-lock validation for payment creation.
 *
 * Shared by both POST /v1/payments implementations (the Next route in
 * `app/api/v1/payments/route.ts` and the Hono billing router in
 * `src/server/hono/routes/billing.ts`), which are otherwise duplicated.
 *
 * Rule: when a payment references a quote-locked appointment (via
 * `metadata.appointment_id`) — either a website-quote lock or a
 * booking-link client quote lock (see @/lib/price-lock) — the amount that
 * may be collected is exactly the remaining locked balance — the stored
 * quote minus the amount already paid on the appointment's invoice
 * (`invoices.amount_paid`, the canonical financial record) — read from the
 * database, never from client data. A mismatch is REJECTED, not silently
 * clamped: clamping would hide the discrepancy (and could under- or
 * over-collect) without staff ever seeing it. The error names the expected
 * amount so staff can correct the collect amount explicitly.
 */
import {
  isClientQuoteLocked,
  isWebsiteQuoteLocked,
  lockedQuoteTotal,
  roundToCents,
} from "@/lib/price-lock";

export const PRICE_LOCK_AMOUNT_MISMATCH_CODE = "price_lock_amount_mismatch";
export const PRICE_LOCK_AMOUNT_MISMATCH_STATUS = 409;

export interface LockedQuoteExpectation {
  locked: true;
  quote: number;
  amountPaid: number;
  expectedAmount: number;
  /** Human label for the lock's channel, used in the mismatch message. */
  quoteLabel: "website quote" | "booking-link quote";
}

export type QuoteExpectation = LockedQuoteExpectation | { locked: false };

// The routes pass their workspace-scoped Supabase client; only the query
// surface used here is required.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

function firstRow(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) {
    const first = data[0];
    return first && typeof first === "object" ? (first as Record<string, unknown>) : null;
  }
  return data && typeof data === "object" ? (data as Record<string, unknown>) : null;
}

/**
 * Resolve the locked-quote expectation for an appointment, or
 * `{ locked: false }` when the appointment does not exist or is not locked
 * (native appointments keep their existing payment behavior byte-for-byte).
 */
export async function resolveLockedQuoteExpectation(
  supabase: SupabaseLike,
  workspaceId: string,
  appointmentId: string,
): Promise<QuoteExpectation> {
  const { data: appointment, error: appointmentError } = await supabase
    .from("appointments")
    .select("source,metadata")
    .eq("workspace_id", workspaceId)
    .eq("id", appointmentId)
    .maybeSingle();
  if (appointmentError) throw appointmentError;
  const row = firstRow(appointment);
  if (!row || (!isWebsiteQuoteLocked(row) && !isClientQuoteLocked(row))) return { locked: false };
  const quote = lockedQuoteTotal(row);
  if (quote === null) return { locked: false };
  const quoteLabel: LockedQuoteExpectation["quoteLabel"] = isWebsiteQuoteLocked(row)
    ? "website quote"
    : "booking-link quote";

  // The invoice is the canonical financial record for the appointment; its
  // amount_paid is what has already been collected against the quote.
  const { data: invoices, error: invoiceError } = await supabase
    .from("invoices")
    .select("amount_paid")
    .eq("workspace_id", workspaceId)
    .contains("metadata", { appointment_id: appointmentId })
    .order("created_at", { ascending: false })
    .limit(1);
  if (invoiceError) throw invoiceError;
  const invoice = firstRow(invoices);
  const paidRaw = invoice ? Number(invoice.amount_paid ?? 0) : 0;
  const amountPaid = Number.isFinite(paidRaw) && paidRaw > 0 ? roundToCents(paidRaw) : 0;
  const expectedAmount = Math.max(0, roundToCents(quote - amountPaid));
  return { locked: true, quote, amountPaid, expectedAmount, quoteLabel };
}

/** True when two dollar amounts agree to the cent. */
export function amountsEqualToCent(a: number, b: number): boolean {
  return Math.round(Number(a) * 100) === Math.round(Number(b) * 100);
}

export interface LockedAmountMismatch {
  code: typeof PRICE_LOCK_AMOUNT_MISMATCH_CODE;
  message: string;
  expected_amount: number;
  requested_amount: number;
}

/**
 * Build the rejection for a locked payment whose amount is not exactly the
 * remaining locked balance, or return null when the amount is exact.
 */
export function lockedAmountMismatch(
  expectation: LockedQuoteExpectation,
  requestedAmount: number,
): LockedAmountMismatch | null {
  if (amountsEqualToCent(requestedAmount, expectation.expectedAmount)) return null;
  const fmt = (value: number) => `$${roundToCents(value).toFixed(2)}`;
  return {
    code: PRICE_LOCK_AMOUNT_MISMATCH_CODE,
    message:
      `This appointment carries a locked ${expectation.quoteLabel} of ${fmt(expectation.quote)} ` +
      `with ${fmt(expectation.amountPaid)} already paid, so the amount to collect is ` +
      `exactly ${fmt(expectation.expectedAmount)}. Received ${fmt(requestedAmount)}.`,
    expected_amount: expectation.expectedAmount,
    requested_amount: roundToCents(requestedAmount),
  };
}

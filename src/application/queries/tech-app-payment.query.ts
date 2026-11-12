/**
 * Tech app — job payment state (pay-by-link step of the payment loop,
 * 2026-11-12).
 *
 * The tech app's Collect section renders exactly this shape and nothing
 * else: the state is derived here, in one pure function, from the job's
 * canonical invoice + payment rows so the phone can never invent a
 * balance or a paid state the books don't carry.
 *
 * Canonical links (the same ones the office closeout uses):
 * - the job's invoice is invoices.metadata->>'appointment_id' = job id
 *   (void invoices excluded), latest first;
 * - the job's payment is payments.invoice_id = invoice.id, falling back
 *   to payments.metadata @> { appointment_id: job id }.
 *
 * Amounts are canonical dollars. amount_due is the invoice balance
 * (total − amount_paid); with no invoice it falls back to the payment
 * amount, and with neither it is null — unknown, never zero-by-default.
 */

export interface TechPaymentInvoiceLike {
  [key: string]: unknown;
  id: string;
  invoice_number?: string | null;
  total?: number | string | null;
  amount_paid?: number | string | null;
  status?: string | null;
}

export interface TechPaymentPaymentLike {
  [key: string]: unknown;
  id: string;
  status?: string | null;
  amount?: number | string | null;
  currency_code?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface TechJobPaymentState {
  has_invoice: boolean;
  invoice_id: string | null;
  invoice_number: string | null;
  invoice_status: string | null;
  /** Canonical dollars owed right now; null when nothing prices the job. */
  amount_due: number | null;
  currency_code: string;
  paid: boolean;
  payment_id: string | null;
  payment_status: string | null;
  /** Hosted invoice URL from the last send, when one was sent. */
  payment_url: string | null;
  invoice_sent_at: string | null;
  /**
   * The customer's email ON PURPOSE, for exactly one use: the Collect
   * step's destination check ("Payment link and receipt go to X —
   * right?") with a correction path. It is deliberately not part of
   * the jobs payload the phone renders on the customer card.
   */
  customer_email: string | null;
  customer_email_present: boolean;
  /** True when Send can actually run: invoice exists, unpaid, emailable. */
  can_send: boolean;
}

function dollars(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function metadataText(metadata: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function deriveTechJobPaymentState(input: {
  invoice: TechPaymentInvoiceLike | null;
  payment: TechPaymentPaymentLike | null;
  customerEmail: string | null;
}): TechJobPaymentState {
  const { invoice, payment } = input;
  const customerEmailPresent = !!(input.customerEmail && input.customerEmail.trim());

  const paid =
    payment?.status === "succeeded" ||
    invoice?.status === "paid";

  let amountDue: number | null = null;
  if (paid) {
    amountDue = 0;
  } else if (invoice) {
    const total = dollars(invoice.total);
    const amountPaid = dollars(invoice.amount_paid) ?? 0;
    amountDue = total === null ? null : Math.max(0, Math.round((total - amountPaid) * 100) / 100);
  } else if (payment) {
    amountDue = dollars(payment.amount);
  }

  return {
    has_invoice: !!invoice,
    invoice_id: invoice?.id ?? null,
    invoice_number: invoice?.invoice_number ?? null,
    invoice_status: invoice?.status ?? null,
    amount_due: amountDue,
    currency_code: payment?.currency_code ?? "USD",
    paid,
    payment_id: payment?.id ?? null,
    payment_status: payment?.status ?? null,
    payment_url: metadataText(payment?.metadata, "payment_url"),
    invoice_sent_at: metadataText(payment?.metadata, "invoice_sent_at"),
    customer_email: input.customerEmail && input.customerEmail.trim() ? input.customerEmail.trim() : null,
    customer_email_present: customerEmailPresent,
    can_send: !!invoice && !paid && customerEmailPresent,
  };
}

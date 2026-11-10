import { apiClient, ApiClientError } from "@/lib/api-client";

export interface CanonicalCashReceipt {
  payment_record_id: string;
  payment_status: string;
  payment_provider: string | null;
  /**
   * The receipt's effective date — the instant every collected figure
   * buckets on. When the payment links to an appointment (through the
   * invoice chain), this is the JOB's service date; otherwise it is the
   * paid date. Collected counts on the job's date, not the typing date.
   */
  collected_at: string;
  /** The linked appointment's starts_at when the chain resolved, else null. */
  service_date: string | null;
  collected_cents: number;
  refunded_cents: number;
  net_collected_cents: number;
  payment_type: string | null;
  tax_amount: number;
  data_origin: string | null;
  metadata: Record<string, unknown>;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function dollarsToCents(value: unknown): number {
  const dollars = Number(value ?? 0);
  return Number.isFinite(dollars) ? Math.round(dollars * 100) : 0;
}

function metadataDollars(metadata: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const value = metadata[key];
    if (value != null && Number.isFinite(Number(value))) return Number(value);
  }
  return 0;
}

function refundDollars(status: string, amountDollars: number, metadata: Record<string, unknown>): number {
  if (status === "refunded") {
    const recorded = metadataDollars(metadata, "refunded_amount", "refund_amount");
    return recorded > 0 ? Math.min(recorded, amountDollars) : amountDollars;
  }
  if (status === "partially_refunded") {
    return Math.min(
      Math.max(metadataDollars(metadata, "refunded_amount", "refund_amount"), 0),
      amountDollars,
    );
  }
  return 0;
}

function taxDollars(metadata: Record<string, unknown>): number {
  const direct = metadataDollars(metadata, "tax_amount", "tax");
  if (direct > 0) return direct;
  const pricingDetails = object(metadata.pricing_details);
  return metadataDollars(pricingDetails, "taxAmount", "tax_amount");
}

interface PaymentReceiptRow {
  id: string;
  amount: number | null;
  status: string;
  provider: string | null;
  paid_at: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
  invoice_id?: string | null;
  /** Resolved server-side via invoice → work order → appointment. */
  appointment_starts_at?: string | null;
}

/**
 * A cash-closeout waiver row: the manual-payment flow records the waived
 * difference as its own succeeded payment row (metadata.source =
 * "manual_adjustment") so the reconcile trigger can settle the invoice,
 * but no cash moved on it. Collected means succeeded payments that are
 * NOT adjustments, so waiver rows are not cash receipts and never enter
 * this set. Null-tolerant: rows without metadata, or metadata without a
 * `source` key, are ordinary receipts and stay.
 */
function isManualAdjustment(metadata: Record<string, unknown>): boolean {
  return metadata.source === "manual_adjustment";
}

/**
 * Canonical replacement for the retired cash_collection_receipts_v1 view.
 * Settled cash is periodized by its EFFECTIVE date — the linked
 * appointment's service date when the payment resolves through the
 * invoice chain (resolved and windowed server-side by
 * GET /v1/billing/cash-receipts), otherwise payments.paid_at — and always
 * scoped to the caller's workspace (the workspaceId param is
 * compatibility-only). Because collected_at is an instant, consumers
 * bucket it against workspace-timezone day boundaries exactly as they
 * did when it was the paid instant: the job's day in the business
 * timezone is the day that counts. Adjustment rows (cash-closeout
 * waivers) are excluded — see isManualAdjustment.
 */
export async function fetchCanonicalCashReceipts(params: {
  workspaceId: string;
  from: string;
  to?: string;
}): Promise<{ data: CanonicalCashReceipt[]; error: unknown | null }> {
  try {
    const { data } = await apiClient.get<{ data: PaymentReceiptRow[] }>("/v1/billing/cash-receipts", {
      query: {
        from: params.from,
        ...(params.to ? { to: params.to } : {}),
      },
    });
    return {
      data: (data ?? [])
        .map((row) => {
          const metadata = object(row.metadata);
          const amountDollars = Math.max(Number(row.amount ?? 0), 0);
          const refundedDollars = refundDollars(row.status, amountDollars, metadata);
          const collectedCents = dollarsToCents(amountDollars);
          const refundedCents = dollarsToCents(refundedDollars);
          const paymentType = metadata.payment_type ?? metadata.payment_method ?? row.provider ?? null;
          const dataOrigin = metadata.data_origin ?? metadata.origin ?? null;
          const serviceDate = typeof row.appointment_starts_at === "string" && row.appointment_starts_at
            ? row.appointment_starts_at
            : null;

          return {
            payment_record_id: row.id,
            payment_status: row.status,
            payment_provider: row.provider,
            // The job's date when the payment links to an appointment;
            // the paid/recorded date when no appointment link resolves.
            collected_at: serviceDate ?? row.paid_at ?? row.created_at,
            service_date: serviceDate,
            collected_cents: collectedCents,
            refunded_cents: refundedCents,
            net_collected_cents: Math.max(collectedCents - refundedCents, 0),
            payment_type: paymentType == null ? null : String(paymentType),
            tax_amount: dollarsToCents(taxDollars(metadata)),
            data_origin: dataOrigin == null ? null : String(dataOrigin),
            metadata,
          };
        })
        // Waivers are not receipts: a succeeded adjustment row records a
        // discount the shop ate, not money collected.
        .filter((receipt) => !isManualAdjustment(receipt.metadata))
        // Drop receipts with no usable collection date — they cannot be
        // bucketed by day and would crash date formatting downstream.
        .filter((receipt) => !!receipt.collected_at),
      error: null,
    };
  } catch (error) {
    return { data: [], error: error instanceof ApiClientError ? new Error(error.message) : error };
  }
}

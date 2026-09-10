import { supabase } from "@/integrations/supabase/client";

export interface CanonicalCashReceipt {
  payment_record_id: string;
  payment_status: string;
  payment_provider: string | null;
  collected_at: string;
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

/**
 * Canonical replacement for the retired cash_collection_receipts_v1 view.
 * Settled cash is periodized by payments.paid_at and always scoped to one workspace.
 */
export async function fetchCanonicalCashReceipts(params: {
  workspaceId: string;
  from: string;
  to?: string;
}): Promise<{ data: CanonicalCashReceipt[]; error: unknown | null }> {
  let query = supabase
    .from("payments")
    .select("id,amount,status,provider,paid_at,created_at,metadata")
    .eq("workspace_id", params.workspaceId)
    .in("status", ["succeeded", "partially_refunded", "refunded"])
    .not("paid_at", "is", null)
    .gte("paid_at", params.from)
    .order("paid_at", { ascending: true });

  if (params.to) query = query.lte("paid_at", params.to);

  const { data, error } = await query;
  if (error) return { data: [], error };

  return {
    data: (data ?? []).map((row) => {
      const metadata = object(row.metadata);
      const amountDollars = Math.max(Number(row.amount ?? 0), 0);
      const refundedDollars = refundDollars(row.status, amountDollars, metadata);
      const collectedCents = dollarsToCents(amountDollars);
      const refundedCents = dollarsToCents(refundedDollars);
      const paymentType = metadata.payment_type ?? metadata.payment_method ?? row.provider ?? null;
      const dataOrigin = metadata.data_origin ?? metadata.origin ?? null;

      return {
        payment_record_id: row.id,
        payment_status: row.status,
        payment_provider: row.provider,
        collected_at: row.paid_at ?? row.created_at,
        collected_cents: collectedCents,
        refunded_cents: refundedCents,
        net_collected_cents: Math.max(collectedCents - refundedCents, 0),
        payment_type: paymentType == null ? null : String(paymentType),
        tax_amount: dollarsToCents(taxDollars(metadata)),
        data_origin: dataOrigin == null ? null : String(dataOrigin),
        metadata,
      };
    }),
    error: null,
  };
}

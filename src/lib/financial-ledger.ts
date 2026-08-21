import {
  canonicalizeServiceRecord,
  type CanonicalServiceFinancialRecord,
} from "@/lib/canonicalFinancials";
import { bankersRound, toCents } from "@/lib/financialMath";
import {
  computeFinancialSummary,
  toCentsFromDollars,
  toDollarsFromCents,
  type LedgerPayment,
} from "@/domain/financials/canonical-financials";

export function mapServicesToCanonicalLedger(
  services: Array<{
    total_cost?: number | null;
    tax_amount?: number | null;
    discount_amount?: number | null;
    shop_supplies?: number | null;
    paid_amount?: number | null;
    payment_status?: string | null;
    status?: string | null;
  }>,
): CanonicalServiceFinancialRecord[] {
  return services.map((s) =>
    canonicalizeServiceRecord({
      total_cost: Number(s.total_cost) || 0,
      tax_amount: Number(s.tax_amount) || 0,
      discount_amount: Number(s.discount_amount) || 0,
      fee_amount: Number(s.shop_supplies) || 0,
      amount_paid: Number(s.paid_amount) || 0,
      payment_status: s.payment_status,
      status: s.status,
    }),
  );
}

export function mapPaymentsToCanonicalLedger(
  payments: Array<{ amount?: number | null; refund_amount?: number | null; status?: string | null }>,
): LedgerPayment[] {
  return payments.map((p) => ({
    amountCents: toCents(Math.round(Number(p.amount) || 0)),
    refundAmountCents: Math.round(Number(p.refund_amount) || 0),
    status: p.status || "succeeded",
  }));
}

export function computeLedgerMetrics(params: {
  services: Array<{
    total_cost?: number | null;
    tax_amount?: number | null;
    discount_amount?: number | null;
    shop_supplies?: number | null;
    paid_amount?: number | null;
    payment_status?: string | null;
    status?: string | null;
  }>;
  payments: Array<{ amount?: number | null; refund_amount?: number | null; status?: string | null }>;
  processingFees?: number;
}) {
  const services = mapServicesToCanonicalLedger(params.services).filter((s) => s.job_status === "completed");
  const summary = computeFinancialSummary({
    services: services.map((s) => ({
      totalDueCents: toCents(toCentsFromDollars(s.total_due)),
      balanceDueCents: toCents(toCentsFromDollars(s.balance_due)),
      jobStatus: s.job_status,
    })),
    payments: mapPaymentsToCanonicalLedger(params.payments),
  });

  const completedValue = toDollarsFromCents(summary.bookedCents);
  const outstanding = toDollarsFromCents(summary.outstandingCents);
  const revenueCollected = toDollarsFromCents(summary.collectedCents);
  const averageTicket = services.length > 0 ? bankersRound(completedValue / services.length, 2) : 0;

  return {
    revenueCollected,
    completedValue,
    outstanding,
    collectedCash: revenueCollected,
    grossBilled: completedValue,
    netCollectedAfterFees: bankersRound(revenueCollected - (params.processingFees || 0), 2),
    averageTicket,
    completedJobs: services.length,
  };
}

export function computeCollectedCashTotal(
  payments: Array<{ amount?: number | null; refund_amount?: number | null; status?: string | null }>,
): number {
  const summary = computeFinancialSummary({
    services: [],
    payments: mapPaymentsToCanonicalLedger(payments),
  });
  return toDollarsFromCents(summary.collectedCents);
}

export function groupMonthlyCollectedRevenue(
  payments: Array<{ created_at: string; amount?: number | null; refund_amount?: number | null; status?: string | null }>,
  monthLabel: (dateIso: string) => string,
): { month: string; revenue: number }[] {
  // payments.amount and refund_amount are stored in CENTS — convert to dollars for display.
  const map = new Map<string, number>();
  payments.forEach((p) => {
    const label = monthLabel(p.created_at);
    const netCents = Number(p.amount || 0) - Number(p.refund_amount || 0);
    map.set(label, bankersRound((map.get(label) || 0) + toDollarsFromCents(netCents), 2));
  });
  return Array.from(map.entries()).map(([month, revenue]) => ({ month, revenue }));
}

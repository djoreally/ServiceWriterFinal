import { bankersRound, dollarsToCents, toDollars, type Cents } from "@/lib/financialMath";

export type LedgerPaymentStatus = "pending" | "processing" | "succeeded" | "paid" | "failed" | "refunded" | "partially_refunded" | string;
export type LedgerInvoiceStatus = "none" | "draft" | "issued" | "partial" | "paid" | "void";
export type LedgerSettlementStatus = "unpaid" | "partial" | "paid" | "refunded";

export interface LedgerPayment {
  amountCents: Cents;
  refundAmountCents?: number;
  status: LedgerPaymentStatus;
}

export interface LedgerService {
  totalDueCents: Cents;
  balanceDueCents: Cents;
  jobStatus: "scheduled" | "in_progress" | "completed" | "cancelled";
}

export type FinancialSummary = {
  bookedCents: number;
  invoicedCents: number;
  collectedCents: number;
  refundedCents: number;
  outstandingCents: number;
};

export function toDollarsFromCents(cents: number): number {
  return bankersRound((cents || 0) / 100, 2);
}

export function toCentsFromDollars(dollars: number): number {
  return dollarsToCents(toDollars(dollars || 0));
}

function isSettledStatus(status: string): boolean {
  return status === "succeeded" || status === "paid" || status === "refunded" || status === "partially_refunded";
}

export function computeFinancialSummary(params: {
  payments: LedgerPayment[];
  services: LedgerService[];
}): FinancialSummary {
  const settledPayments = params.payments.filter((p) => isSettledStatus((p.status || "").toLowerCase()));
  const completedServices = params.services.filter((s) => s.jobStatus === "completed");

  const bookedCents = completedServices.reduce((sum, s) => sum + (s.totalDueCents || 0), 0);
  const invoicedCents = bookedCents;
  const collectedCents = settledPayments.reduce((sum, p) => sum + (p.amountCents || 0), 0);
  const refundedCents = settledPayments.reduce((sum, p) => sum + (p.refundAmountCents || 0), 0);
  const outstandingCents = Math.max(
    completedServices.reduce((sum, s) => sum + Math.max(s.balanceDueCents || 0, 0), 0),
    0,
  );

  return {
    bookedCents,
    invoicedCents,
    collectedCents: Math.max(collectedCents - refundedCents, 0),
    refundedCents,
    outstandingCents,
  };
}

export function deriveSettlementStatus(summary: FinancialSummary): LedgerSettlementStatus {
  if (summary.collectedCents > 0 && summary.refundedCents >= summary.collectedCents) return "refunded";
  if (summary.outstandingCents <= 0 && summary.collectedCents > 0) return "paid";
  if (summary.collectedCents > 0) return "partial";
  return "unpaid";
}

export function deriveInvoiceStatus(summary: FinancialSummary): LedgerInvoiceStatus {
  if (summary.invoicedCents <= 0) return "none";
  if (summary.collectedCents <= 0) return "issued";
  if (summary.outstandingCents > 0) return "partial";
  return "paid";
}

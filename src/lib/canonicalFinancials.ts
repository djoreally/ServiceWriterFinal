import { bankersRound, toCents } from "@/lib/financialMath";
import {
  type InvoicePaymentStatus as PaymentStatus,
  type JobLifecycleStatus as JobStatus,
} from "@packages/shared/lifecycle";
import {
  computeFinancialSummary,
  toCentsFromDollars,
  toDollarsFromCents,
} from "@/domain/financials/canonical-financials";

export interface CanonicalMoneyModel {
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  fee_amount: number;
  total_due: number;
  amount_paid: number;
  balance_due: number;
}

export interface CanonicalServiceFinancialRecord extends CanonicalMoneyModel {
  job_status: JobStatus;
  payment_status: PaymentStatus;
}

export interface CanonicalPaymentRecord {
  amount_cents: number;
  refund_amount_cents?: number;
  status: string;
}

export interface CanonicalFinancialMetrics {
  revenueCollected: number;
  completedValue: number;
  outstanding: number;
  collectedCash: number;
  grossBilled: number;
  netCollectedAfterFees: number;
  averageTicket: number;
  completedJobs: number;
}

function normalizeJobStatus(status: string | null | undefined): JobStatus {
  if (status === "completed") return "completed";
  if (status === "in_progress") return "in_progress";
  if (status === "cancelled") return "cancelled";
  return "scheduled";
}

export function derivePaymentStatus(totalDue: number, amountPaid: number): PaymentStatus {
  if (amountPaid <= 0) return "unpaid";
  if (amountPaid >= totalDue) return "paid";
  return "partially_paid";
}

export function canonicalizeServiceRecord(input: {
  total_cost?: number | null;
  subtotal?: number | null;
  tax_amount?: number | null;
  discount_amount?: number | null;
  fee_amount?: number | null;
  total_due?: number | null;
  amount_paid?: number | null;
  payment_status?: string | null;
  status?: string | null;
}): CanonicalServiceFinancialRecord {
  const subtotal = bankersRound(
    input.subtotal ?? input.total_cost ?? input.total_due ?? 0,
    2,
  );
  const taxAmount = bankersRound(input.tax_amount ?? 0, 2);
  const discountAmount = bankersRound(input.discount_amount ?? 0, 2);
  const feeAmount = bankersRound(input.fee_amount ?? 0, 2);

  const derivedTotalDue = bankersRound(subtotal - discountAmount + feeAmount + taxAmount, 2);
  const totalDue = bankersRound(input.total_due ?? input.total_cost ?? derivedTotalDue, 2);

  let amountPaid = bankersRound(input.amount_paid ?? 0, 2);
  const dbPaymentStatus = (input.payment_status || "").toLowerCase();

  if (amountPaid === 0 && dbPaymentStatus === "paid") {
    amountPaid = totalDue;
  }

  const balanceDue = bankersRound(Math.max(totalDue - amountPaid, 0), 2);

  return {
    subtotal,
    tax_amount: taxAmount,
    discount_amount: discountAmount,
    fee_amount: feeAmount,
    total_due: totalDue,
    amount_paid: amountPaid,
    balance_due: balanceDue,
    job_status: normalizeJobStatus(input.status),
    payment_status: derivePaymentStatus(totalDue, amountPaid),
  };
}

export function aggregateCollectedCash(payments: CanonicalPaymentRecord[]): {
  grossCollected: number;
  refunds: number;
  netCollected: number;
} {
  const grossCollected = toDollarsFromCents(
    payments
      .filter((p) => p.status === "succeeded" || p.status === "refunded")
      .reduce((sum, p) => sum + (p.amount_cents || 0), 0),
  );

  const refunds = toDollarsFromCents(
    payments
      .filter((p) => p.status === "succeeded" || p.status === "refunded")
      .reduce((sum, p) => sum + (p.refund_amount_cents || 0), 0),
  );

  return {
    grossCollected,
    refunds,
    netCollected: bankersRound(grossCollected - refunds, 2),
  };
}

export function computeCanonicalFinancialMetrics(params: {
  payments: CanonicalPaymentRecord[];
  services: CanonicalServiceFinancialRecord[];
  processingFees?: number;
}): CanonicalFinancialMetrics {
  const completedJobs = params.services.filter((s) => s.job_status === "completed");
  const summary = computeFinancialSummary({
    payments: params.payments.map((p) => ({
      amountCents: toCents(p.amount_cents || 0),
      refundAmountCents: p.refund_amount_cents || 0,
      status: p.status || "succeeded",
    })),
    services: completedJobs.map((s) => ({
      totalDueCents: toCents(toCentsFromDollars(s.total_due)),
      balanceDueCents: toCents(toCentsFromDollars(s.balance_due)),
      jobStatus: s.job_status,
    })),
  });

  const completedValue = toDollarsFromCents(summary.bookedCents);
  const outstanding = toDollarsFromCents(summary.outstandingCents);
  const netCollected = toDollarsFromCents(summary.collectedCents);
  const grossCollected = toDollarsFromCents(summary.collectedCents + summary.refundedCents);

  const averageTicket =
    completedJobs.length > 0 ? bankersRound(completedValue / completedJobs.length, 2) : 0;

  return {
    revenueCollected: netCollected,
    completedValue,
    outstanding,
    collectedCash: netCollected,
    grossBilled: completedValue,
    netCollectedAfterFees: bankersRound(netCollected - (params.processingFees || 0), 2),
    averageTicket,
    completedJobs: completedJobs.length,
  };
}

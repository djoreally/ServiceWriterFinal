import {
  aggregateCollectedCash,
  canonicalizeServiceRecord,
  computeCanonicalFinancialMetrics,
  derivePaymentStatus,
} from "@/lib/canonicalFinancials";

describe("canonicalFinancials", () => {
  it("keeps operational status separated from payment status", () => {
    const row = canonicalizeServiceRecord({
      total_cost: 112,
      status: "completed",
      payment_status: "unpaid",
    });

    expect(row.job_status).toBe("completed");
    expect(row.payment_status).toBe("unpaid");
    expect(row.total_due).toBe(112);
    expect(row.amount_paid).toBe(0);
    expect(row.balance_due).toBe(112);
  });

  it("computes collected cash from payment records only", () => {
    const totals = aggregateCollectedCash([
      { amount_cents: 10000, status: "succeeded" },
      { amount_cents: 1200, refund_amount_cents: 200, status: "refunded" },
      { amount_cents: 9999, status: "pending" },
    ]);

    expect(totals.grossCollected).toBe(112);
    expect(totals.refunds).toBe(2);
    expect(totals.netCollected).toBe(110);
  });

  it("returns canonical dashboard metrics", () => {
    const services = [
      canonicalizeServiceRecord({ total_cost: 112, status: "completed", payment_status: "paid" }),
      canonicalizeServiceRecord({ total_cost: 56, status: "completed", payment_status: "unpaid" }),
      canonicalizeServiceRecord({ total_cost: 23, status: "in_progress", payment_status: "unpaid" }),
    ];

    const metrics = computeCanonicalFinancialMetrics({
      services,
      payments: [
        { amount_cents: 11200, status: "succeeded" },
        { amount_cents: 2000, refund_amount_cents: 500, status: "refunded" },
      ],
      processingFees: 3,
    });

    expect(metrics.revenueCollected).toBe(127);
    expect(metrics.completedValue).toBe(168);
    expect(metrics.outstanding).toBe(56);
    expect(metrics.netCollectedAfterFees).toBe(124);
    expect(metrics.averageTicket).toBe(84);
    expect(metrics.completedJobs).toBe(2);
  });


  it("does not allow scheduled jobs to affect billed or outstanding totals", () => {
    const services = [
      canonicalizeServiceRecord({ total_cost: 112, status: "completed", amount_paid: 12 }),
      canonicalizeServiceRecord({ total_cost: 999, status: "scheduled", amount_paid: 0 }),
    ];

    const metrics = computeCanonicalFinancialMetrics({
      services,
      payments: [{ amount_cents: 1200, status: "succeeded" }],
    });

    expect(metrics.completedValue).toBe(112);
    expect(metrics.outstanding).toBe(100);
    expect(metrics.revenueCollected).toBe(12);
  });
  it("derives payment status deterministically", () => {
    expect(derivePaymentStatus(112, 0)).toBe("unpaid");
    expect(derivePaymentStatus(112, 50)).toBe("partially_paid");
    expect(derivePaymentStatus(112, 112)).toBe("paid");
  });
});

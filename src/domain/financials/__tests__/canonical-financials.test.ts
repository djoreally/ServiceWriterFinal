import {
  computeFinancialSummary,
  deriveInvoiceStatus,
  deriveSettlementStatus,
} from '@/domain/financials/canonical-financials';

describe('domain canonical financials', () => {
  it('computes collected/refunded/outstanding consistently in cents', () => {
    const summary = computeFinancialSummary({
      payments: [
        { amountCents: 10000, refundAmountCents: 0, status: 'succeeded' },
        { amountCents: 5000, refundAmountCents: 1000, status: 'refunded' },
      ],
      services: [
        { totalDueCents: 12000, balanceDueCents: 2000, jobStatus: 'completed' },
        { totalDueCents: 3000, balanceDueCents: 3000, jobStatus: 'scheduled' },
      ],
    });

    expect(summary.bookedCents).toBe(12000);
    expect(summary.collectedCents).toBe(14000);
    expect(summary.refundedCents).toBe(1000);
    expect(summary.outstandingCents).toBe(2000);
  });

  it('includes legacy paid and partially refunded receipts in collected cash', () => {
    const summary = computeFinancialSummary({
      payments: [
        { amountCents: 10000, status: 'paid' },
        { amountCents: 5000, refundAmountCents: 1000, status: 'partially_refunded' },
      ],
      services: [],
    });

    expect(summary.collectedCents).toBe(14000);
    expect(summary.refundedCents).toBe(1000);
  });

  it('derives canonical invoice/payment statuses from summary', () => {
    const partial = {
      bookedCents: 12000,
      invoicedCents: 12000,
      collectedCents: 8000,
      refundedCents: 0,
      outstandingCents: 4000,
    };
    expect(deriveSettlementStatus(partial)).toBe('partial');
    expect(deriveInvoiceStatus(partial)).toBe('partial');
  });
});

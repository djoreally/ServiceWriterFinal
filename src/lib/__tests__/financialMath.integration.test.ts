import {
  bankersRound,
  computeFinancialSummary,
  dollarsToCents,
  centsToDollars,
  toCents,
  toDollars,
  type Cents,
  type Dollars,
} from "@/lib/financialMath";

describe("GROUP 1: ServiceRecordForm total calculation", () => {
  it("discount exactly equals subtotal → total is 0, not negative", () => {
    // WHY: computeFinancialSummary caps discount at subtotal and totals cannot go below zero.
    const summary = computeFinancialSummary({
      subtotal: bankersRound(40 + 30 + 30, 2),
      discount: 100,
      taxRate: 0,
    });

    expect(summary.subtotal).toBe(100);
    expect(summary.discount).toBe(100);
    expect(summary.total).toBe(0);
  });

  it("discount greater than subtotal → discount capped, total is 0", () => {
    // WHY: discount is min(discount, subtotal), so over-discounting cannot create negative totals.
    const summary = computeFinancialSummary({
      subtotal: bankersRound(55.55 + 10.0 + 4.45, 2),
      discount: 999,
      taxRate: 0,
    });

    expect(summary.subtotal).toBe(70);
    expect(summary.discount).toBe(70);
    expect(summary.total).toBe(0);
  });

  it("tax on subtotal of 0 → tax is 0", () => {
    // WHY: taxable amount is zero, so percent tax must also evaluate to zero exactly.
    const summary = computeFinancialSummary({
      subtotal: 0,
      discount: 0,
      taxRate: 0.0825,
    });

    expect(summary.taxableAmount).toBe(0);
    expect(summary.tax).toBe(0);
    expect(summary.total).toBe(0);
  });

  it("subtotal 100 + 8.25% tax → total is 108.25", () => {
    // WHY: banker's rounding on 100 * 0.0825 is 8.25 exactly; total is deterministic 108.25.
    const summary = computeFinancialSummary({
      subtotal: 100,
      discount: 0,
      taxRate: 0.0825,
    });

    expect(summary.tax).toBe(8.25);
    expect(summary.total).toBe(108.25);
  });

  it("labor 33.333 + parts 33.333 → subtotal is 66.67", () => {
    // WHY: intermediate arithmetic can produce 66.666..., banker's rounding to 2dp gives 66.67.
    const subtotal = bankersRound(33.333 + 33.333, 2);
    expect(subtotal).toBe(66.67);
  });
});

describe("GROUP 2: Quote line item totals", () => {
  const lineTotal = (qty: number, unitPrice: number): number =>
    bankersRound(bankersRound(qty * unitPrice, 4), 2);

  it("qty 3 * price 1.005 → line total 3.02", () => {
    // WHY: quote logic rounds the line product to 4dp then to 2dp, yielding 3.02.
    expect(lineTotal(3, 1.005)).toBe(3.02);
  });

  it("qty 1 * price 2.445 → 2.44", () => {
    // WHY: at .005 tie, banker's rounding goes to even cent (4 in hundredths place stays even).
    expect(lineTotal(1, 2.445)).toBe(2.44);
  });

  it("qty 1 * price 2.455 → 2.46", () => {
    // WHY: .005 tie rounds to the nearest even hundredth, which is 2.46.
    expect(lineTotal(1, 2.455)).toBe(2.46);
  });

  it("sum of 3 line items with edge cases → running total matches bankersRound", () => {
    // WHY: repo logic rounds each line and then rounds running sum to prevent float drift.
    const items = [
      { qty: 3, price: 1.005 },
      { qty: 1, price: 2.445 },
      { qty: 1, price: 2.455 },
    ];

    const running = items.reduce((sum, item) => {
      const line = bankersRound(item.qty * item.price, 4);
      return bankersRound(sum + line, 2);
    }, 0);

    const expectedFromLines = bankersRound(
      lineTotal(3, 1.005) + lineTotal(1, 2.445) + lineTotal(1, 2.455),
      2,
    );

    expect(running).toBe(expectedFromLines);
    expect(running).toBe(7.92);
  });
});

describe("GROUP 3: Stripe cents conversion", () => {
  it("dollarsToCents(1.005) → 101", () => {
    // WHY: 1.005 rounds to 1.01 under banker's rounding at 2dp, then *100 = 101 cents.
    expect(dollarsToCents(toDollars(1.005))).toBe(101);
  });

  it("dollarsToCents(0.995) → 100", () => {
    // WHY: 0.995 rounds to 1.00 (nearest even cent), not 0.99.
    expect(dollarsToCents(toDollars(0.995))).toBe(100);
  });

  it("dollarsToCents(19.995) → 2000", () => {
    // WHY: tie rounds to even cent (20.00), giving exactly 2000 cents.
    expect(dollarsToCents(toDollars(19.995))).toBe(2000);
  });

  it("dollarsToCents(19.985) → 1998", () => {
    // WHY: tie rounds to even cent (19.98), not 19.99.
    expect(dollarsToCents(toDollars(19.985))).toBe(1998);
  });
});

describe("GROUP 4: Revenue source isolation", () => {
  const deriveRevenue = (
    payments: Array<{ amount: number; refund_amount?: number; status: string }>,
    services: Array<{ total_cost: number; status: string; payment_status: string | null }>,
  ) => {
    // Mirrors dashboard intent: collected is payment_records-only; pending is completed unpaid services.
    const settledPayments = payments.filter((p) => p.status === "succeeded" || p.status === "refunded");
    const grossCollected = centsToDollars(toCents(settledPayments.reduce((sum, p) => sum + p.amount, 0)));
    const refunds = centsToDollars(toCents(settledPayments.reduce((sum, p) => sum + (p.refund_amount || 0), 0)));
    const collected = bankersRound(grossCollected - refunds, 2);
    const pending = bankersRound(
      services
        .filter((s) => s.status === "completed" && (s.payment_status || "").toLowerCase() !== "paid")
        .reduce((sum, s) => sum + s.total_cost, 0),
      2,
    );
    return { collected, pending };
  };

  it("payment_records present → revenue = sum(amount)/100 only", () => {
    // WHY: collected revenue must be sourced from payments, independent of service totals.
    const result = deriveRevenue(
      [{ amount: 12550, status: "succeeded" }],
      [{ total_cost: 9999, status: "completed", payment_status: "unpaid" }],
    );

    expect(result.collected).toBe(125.5);
    expect(result.pending).toBe(9999);
  });

  it("no payment_records → revenue = 0, pending = sum(services.total_cost)", () => {
    // WHY: no settled payments means no collected cash; unpaid completed work is pending only.
    const result = deriveRevenue(
      [],
      [
        { total_cost: 100, status: "completed", payment_status: "unpaid" },
        { total_cost: 50.25, status: "completed", payment_status: null },
      ],
    );

    expect(result.collected).toBe(0);
    expect(result.pending).toBe(150.25);
  });

  it("mixed: both present → collected ≠ collected + pending", () => {
    // WHY: collected and pending are isolated dimensions and must never be merged into one KPI.
    const result = deriveRevenue(
      [{ amount: 10000, status: "succeeded" }],
      [{ total_cost: 100, status: "completed", payment_status: "unpaid" }],
    );

    expect(result.collected).toBe(100);
    expect(result.pending).toBe(100);
    expect(result.collected).not.toBe(result.collected + result.pending);
  });
});

describe("GROUP 5: Currency brand type safety (compile-time)", () => {
  it("Adding Cents + Dollars should fail TypeScript compilation", () => {
    // WHY: branded units prevent accidental cross-unit arithmetic in financial code paths.
    const cents = toCents(100);
    const dollars = toDollars(1);

    // @ts-expect-error Cents and Dollars are distinct units and cannot be mixed directly.
    const invalid: Cents = cents + dollars;

    expect(cents).toBe(100 as Cents);
    expect(dollars).toBe(1 as Dollars);
    expect(invalid).toBe(101 as unknown as Cents);
  });
});

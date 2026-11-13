import { computeAppointmentPaymentAmounts } from "@/lib/appointmentPaymentAmounts";

/**
 * Regression coverage for the INV-106 failure (2026-11-05): creating a
 * payment record from the appointment tab sent $936.81 for a $133.83
 * website-locked quote, and the server's locked-quote guard rejected it.
 * Two defects combined: the tab multiplied by the workspace tax_rate as
 * if it were a fraction (the stored value is a PERCENT — 6 means 6%),
 * and it recomputed tax on top of a locked quote at all.
 */
describe("computeAppointmentPaymentAmounts", () => {
  it("locked quote: collects exactly the locked total, to the cent (INV-106)", () => {
    const amounts = computeAppointmentPaymentAmounts({
      priceLocked: true,
      lockedAmountDue: 133.83,
      estimatedTotal: 133.83,
      taxAmount: 0,
      subtotal: 133.83,
      taxRatePercent: 6,
    });
    expect(amounts.amountCents).toBe(13383);
    expect(amounts.subtotalCents).toBe(13383);
    // Locked quotes carry no separate tax: the quote IS the total.
    expect(amounts.taxCents).toBeNull();
    expect(amounts.taxRate).toBeNull();
  });

  it("locked quote: collects the remaining balance when part was already paid", () => {
    const amounts = computeAppointmentPaymentAmounts({
      priceLocked: true,
      lockedAmountDue: 33.83,
      estimatedTotal: 133.83,
      taxAmount: 0,
      subtotal: 133.83,
      taxRatePercent: 6,
    });
    expect(amounts.amountCents).toBe(3383);
    expect(amounts.taxCents).toBeNull();
    expect(amounts.taxRate).toBeNull();
  });

  it("stored PERCENT tax rate produces invoice-grade math (119 at 6% → 7.14 tax)", () => {
    const amounts = computeAppointmentPaymentAmounts({
      priceLocked: false,
      estimatedTotal: 119,
      taxAmount: 0,
      subtotal: 119,
      taxRatePercent: 6,
    });
    expect(amounts.taxCents).toBe(714);
    expect(amounts.amountCents).toBe(12614);
    expect(amounts.taxRate).toBe(6);
  });

  it("respects tax already recorded on the appointment instead of recomputing it", () => {
    const amounts = computeAppointmentPaymentAmounts({
      priceLocked: false,
      estimatedTotal: 126.14,
      taxAmount: 7.14,
      subtotal: 119,
      taxRatePercent: 6,
    });
    expect(amounts.taxCents).toBe(714);
    expect(amounts.amountCents).toBe(12614);
  });

  it("no tax rate and no recorded tax: amount is the bare subtotal", () => {
    const amounts = computeAppointmentPaymentAmounts({
      priceLocked: false,
      estimatedTotal: 100,
      taxAmount: 0,
      subtotal: 100,
      taxRatePercent: null,
    });
    expect(amounts.amountCents).toBe(10000);
    expect(amounts.taxCents).toBeNull();
    expect(amounts.taxRate).toBeNull();
  });
});

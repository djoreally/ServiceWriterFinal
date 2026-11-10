import {
  isManualAdjustmentRow,
  sumPendingPaymentsCents,
  sumSucceededPaymentsCents,
  type AppointmentPaymentRow,
} from "@/application/queries/appointment-payments.query";

// The per-appointment collected figure falls back to summing the resolved
// payment rows when no composed payment_state is available. A cash
// closeout writes TWO succeeded rows — the cash received and a waiver
// row (metadata.source = "manual_adjustment") for the difference the
// shop ate. Collected means succeeded payments that are NOT adjustments,
// so the waiver must never inflate the collected figure.
function row(partial: Partial<AppointmentPaymentRow>): AppointmentPaymentRow {
  return {
    id: "row-1",
    amount: 0,
    subtotal: null,
    tax_amount: null,
    status: "succeeded",
    payment_type: "cash",
    customer_email: null,
    customer_name: null,
    stripe_payment_intent_id: null,
    created_at: "2026-11-09T19:31:00.000Z",
    updated_at: "2026-11-09T19:31:00.000Z",
    invoice_sent_at: null,
    invoice_id: "invoice-1",
    source: null,
    stripe_sync_status: null,
    stripe_invoice_id: null,
    payment_url: null,
    ...partial,
  };
}

// INV-569's closeout: $110.23 cash in hand, $10.84 waived.
const cashRow = row({ id: "pay-cash", amount: 11023, source: null });
const waiveRow = row({
  id: "pay-waive",
  amount: 1084,
  source: "manual_adjustment",
  payment_type: "payment",
});

describe("sumSucceededPaymentsCents adjustment exclusion", () => {
  it("counts the cash row and excludes the waiver row", () => {
    expect(sumSucceededPaymentsCents([cashRow, waiveRow])).toBe(11023);
  });

  it("counts rows with no source at all (metadata-less rows)", () => {
    expect(sumSucceededPaymentsCents([row({ amount: 5000, source: null })])).toBe(5000);
  });

  it("counts succeeded rows with other sources", () => {
    expect(
      sumSucceededPaymentsCents([
        row({ amount: 2500, source: "manual_closeout" }),
        waiveRow,
      ]),
    ).toBe(2500);
  });

  it("still counts a provider-sync row whose status truly succeeded", () => {
    // Documented behavior: a sync artifact counts once money actually
    // moved against it. The adjustment exclusion must not over-exclude.
    expect(
      sumSucceededPaymentsCents([
        row({ amount: 7500, source: "provider_sync", stripe_sync_status: "synced" }),
      ]),
    ).toBe(7500);
  });

  it("ignores non-succeeded rows regardless of source", () => {
    expect(
      sumSucceededPaymentsCents([
        row({ amount: 9999, status: "pending", source: null }),
        row({ amount: 8888, status: "pending", source: "manual_adjustment" }),
        cashRow,
      ]),
    ).toBe(11023);
  });
});

describe("isManualAdjustmentRow", () => {
  it("matches only the manual_adjustment source", () => {
    expect(isManualAdjustmentRow(waiveRow)).toBe(true);
    expect(isManualAdjustmentRow(cashRow)).toBe(false);
    expect(isManualAdjustmentRow(row({ source: "provider_sync" }))).toBe(false);
  });
});

describe("sumPendingPaymentsCents is unaffected", () => {
  it("still sums pending non-artifact rows", () => {
    expect(
      sumPendingPaymentsCents([
        row({ amount: 4000, status: "pending", source: null }),
        row({ amount: 3000, status: "pending", source: "provider_sync" }),
        waiveRow,
      ]),
    ).toBe(4000);
  });
});

/**
 * Tech app job payment state (pay-by-link step, 2026-11-12):
 * deriveTechJobPaymentState is the only place the phone's Collect
 * section gets its numbers from, so its honesty rules are pinned
 * here — a paid state only from a succeeded payment or a paid
 * invoice, an amount due only from canonical rows, and can_send
 * only when a send can actually run.
 */
import { describe, it, expect } from "@jest/globals";
import { deriveTechJobPaymentState } from "@/application/queries/tech-app-payment.query";

const invoice = {
  id: "inv-1",
  invoice_number: "INV-1042",
  total: 197.05,
  amount_paid: 0,
  status: "issued",
};

const pendingPayment = {
  id: "pay-1",
  status: "pending",
  amount: 197.05,
  currency_code: "USD",
  metadata: { appointment_id: "job-1" },
};

describe("deriveTechJobPaymentState", () => {
  it("reports the open balance for an issued, unpaid invoice", () => {
    const state = deriveTechJobPaymentState({ invoice, payment: pendingPayment, customerEmail: "a@example.com" });
    expect(state).toMatchObject({
      has_invoice: true,
      invoice_id: "inv-1",
      invoice_number: "INV-1042",
      amount_due: 197.05,
      paid: false,
      payment_status: "pending",
      payment_url: null,
      customer_email: "a@example.com",
      customer_email_present: true,
      can_send: true,
    });
  });

  it("nets amount_paid out of the balance", () => {
    const state = deriveTechJobPaymentState({
      invoice: { ...invoice, amount_paid: 50 },
      payment: pendingPayment,
      customerEmail: "a@example.com",
    });
    expect(state.amount_due).toBe(147.05);
  });

  it("is paid only from a succeeded payment or a paid invoice", () => {
    const byPayment = deriveTechJobPaymentState({
      invoice,
      payment: { ...pendingPayment, status: "succeeded" },
      customerEmail: "a@example.com",
    });
    expect(byPayment.paid).toBe(true);
    expect(byPayment.amount_due).toBe(0);
    expect(byPayment.can_send).toBe(false);

    const byInvoice = deriveTechJobPaymentState({
      invoice: { ...invoice, status: "paid" },
      payment: pendingPayment,
      customerEmail: "a@example.com",
    });
    expect(byInvoice.paid).toBe(true);
  });

  it("carries the hosted URL and sent stamp from a previous send", () => {
    const state = deriveTechJobPaymentState({
      invoice,
      payment: {
        ...pendingPayment,
        metadata: {
          appointment_id: "job-1",
          payment_url: "https://invoice.stripe.com/i/acct_1/test",
          invoice_sent_at: "2026-11-12T12:00:00.000Z",
        },
      },
      customerEmail: "a@example.com",
    });
    expect(state.payment_url).toBe("https://invoice.stripe.com/i/acct_1/test");
    expect(state.invoice_sent_at).toBe("2026-11-12T12:00:00.000Z");
  });

  it("cannot send without a customer email, and says so via the flags", () => {
    const state = deriveTechJobPaymentState({ invoice, payment: pendingPayment, customerEmail: null });
    expect(state.customer_email).toBeNull();
    expect(state.customer_email_present).toBe(false);
    expect(state.can_send).toBe(false);
    expect(state.amount_due).toBe(197.05);
  });

  it("with no invoice, falls back to the payment amount and blocks send", () => {
    const state = deriveTechJobPaymentState({ invoice: null, payment: pendingPayment, customerEmail: "a@example.com" });
    expect(state.has_invoice).toBe(false);
    expect(state.amount_due).toBe(197.05);
    expect(state.can_send).toBe(false);
  });

  it("with neither row, the amount is unknown (null), never zero", () => {
    const state = deriveTechJobPaymentState({ invoice: null, payment: null, customerEmail: null });
    expect(state).toMatchObject({
      has_invoice: false,
      amount_due: null,
      paid: false,
      payment_id: null,
      payment_url: null,
      customer_email: null,
      can_send: false,
    });
  });
});

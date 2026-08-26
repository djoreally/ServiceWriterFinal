import { invoiceLifecycleKeyForStatus } from "@/server/messaging/invoice-events";

describe("invoice lifecycle mapping", () => {
  it("maps issued invoices to payment requests", () => {
    expect(invoiceLifecycleKeyForStatus("issued")).toBe("invoice_and_payment_sequence.payment_requested");
  });

  it("maps partial payment, paid, and overdue states", () => {
    expect(invoiceLifecycleKeyForStatus("partially_paid")).toBe("invoice_and_payment_sequence.partial_payment_received");
    expect(invoiceLifecycleKeyForStatus("paid")).toBe("invoice_and_payment_sequence.payment_received");
    expect(invoiceLifecycleKeyForStatus("past_due")).toBe("invoice_and_payment_sequence.invoice_overdue");
  });

  it("does not emit customer lifecycle email for draft, void, or unknown states", () => {
    expect(invoiceLifecycleKeyForStatus("draft")).toBeNull();
    expect(invoiceLifecycleKeyForStatus("void")).toBeNull();
    expect(invoiceLifecycleKeyForStatus("unknown")).toBeNull();
  });
});

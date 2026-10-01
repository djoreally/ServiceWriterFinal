jest.mock("@/server/messaging/lifecycle-events", () => ({
  dispatchLifecycleEvent: jest.fn(),
}));

import { dispatchLifecycleEvent } from "@/server/messaging/lifecycle-events";
import {
  dispatchInvoiceLifecycle,
  dispatchPaymentLifecycle,
  dispatchQuoteLifecycle,
  type InvoiceLifecycleRecord,
  type PaymentLifecycleRecord,
  type QuoteLifecycleRecord,
} from "@/server/messaging/quote-payment-events";

const mockDispatch = dispatchLifecycleEvent as jest.Mock;

function baseQuote(overrides: Partial<QuoteLifecycleRecord> = {}): QuoteLifecycleRecord {
  return {
    id: "quote-uuid-12345678",
    workspace_id: "ws-1",
    customer_id: "cust-1",
    customer_email: "customer@example.com",
    customer_name: "Jordan Smith",
    quote_number: "Q-1001",
    total: 1234.5,
    expires_at: "2026-10-01",
    status: "sent",
    metadata: { description: "Full synthetic oil change", version: "v2" },
    ...overrides,
  };
}

function baseInvoice(overrides: Partial<InvoiceLifecycleRecord> = {}): InvoiceLifecycleRecord {
  return {
    id: "invoice-uuid-12345678",
    workspace_id: "ws-1",
    customer_id: "cust-1",
    customer_email: "customer@example.com",
    customer_name: "Jordan Smith",
    invoice_number: "INV-42",
    total: 250.75,
    due_at: "2026-10-15",
    status: "open",
    metadata: { balance: 100.25 },
    ...overrides,
  };
}

function basePayment(overrides: Partial<PaymentLifecycleRecord> = {}): PaymentLifecycleRecord {
  return {
    id: "payment-uuid-12345678",
    workspace_id: "ws-1",
    customer_id: "cust-1",
    customer_email: "customer@example.com",
    customer_name: "Jordan Smith",
    invoice_id: "inv-9",
    invoice_number: "INV-42",
    amount: 150.0,
    status: "succeeded",
    paid_at: "2026-09-20T10:00:00Z",
    provider_payment_id: "pi_123456",
    metadata: { refund_amount: 25.0, refund_reference: "re_999" },
    ...overrides,
  };
}

const baseCtx = {
  workspaceName: "MOMS Mobile Oil Change",
  workspaceTimezone: "America/New_York",
  workspaceContact: { email: "shop@example.com", phone: "+15551234567" },
  actionUrl: "https://servicewriter.xyz/pay/x",
};

describe("dispatchQuoteLifecycle", () => {
  beforeEach(() => {
    mockDispatch.mockResolvedValue({ status: "queued" });
  });

  it("builds quote variables and routes to the lifecycle dispatcher", async () => {
    await dispatchQuoteLifecycle({
      eventKey: "quotes_and_service_authorization.your_quote_is_ready",
      eventId: "evt-q1",
      quote: baseQuote(),
      ...baseCtx,
    });

    expect(mockDispatch).toHaveBeenCalledTimes(1);
    const event = mockDispatch.mock.calls[0][0] as Record<string, unknown>;
    expect(event.templateKey).toBe("quotes_and_service_authorization.your_quote_is_ready");
    expect(event.eventId).toBe("evt-q1");
    expect(event.entityType).toBe("quote");
    expect(event.entityId).toBe("quote-uuid-12345678");
    expect(event.workspaceId).toBe("ws-1");
    expect(event.customerId).toBe("cust-1");
    expect(event.recipientEmail).toBe("customer@example.com");
    expect(event.recipientRole).toBe("customer");
    const variables = event.variables as Record<string, string>;
    expect(variables["business.name"]).toBe("MOMS Mobile Oil Change");
    expect(variables["business.email"]).toBe("shop@example.com");
    expect(variables["business.phone"]).toBe("+15551234567");
    expect(variables["customer.first_name"]).toBe("Jordan");
    expect(variables["customer.full_name"]).toBe("Jordan Smith");
    expect(variables["quote.number"]).toBe("Q-1001");
    expect(variables["quote.total"]).toBe("$1,234.50");
    expect(variables["quote.expires_at"]).toBe("2026-10-01");
    expect(variables["quote.status"]).toBe("sent");
    expect(variables["quote.description"]).toBe("Full synthetic oil change");
    expect(variables["quote.version"]).toBe("v2");
    expect(variables["email.primary_action_url"]).toBe("https://servicewriter.xyz/pay/x");
    expect(event.metadata).toEqual({ quoteId: "quote-uuid-12345678" });
  });

  it("fills missing optional fields with sensible fallbacks", async () => {
    await dispatchQuoteLifecycle({
      eventKey: "quotes_and_service_authorization.your_quote_is_ready",
      eventId: "evt-q2",
      quote: baseQuote({ quote_number: null, total: null, customer_name: null, expires_at: null, metadata: {} }),
      ...baseCtx,
    });

    const variables = (mockDispatch.mock.calls[0][0] as Record<string, unknown>)
      .variables as Record<string, string>;
    expect(variables["quote.number"]).toBe("QUOTE-UU");
    expect(variables["quote.total"]).toBe("$0.00");
    expect(variables["customer.full_name"]).toBe("Customer");
    expect(variables["customer.first_name"]).toBe("Customer");
    expect(variables["quote.expires_at"]).toBe("See quote details");
    expect(variables["quote.description"]).toBe("Proposed service work");
    expect(variables["appointment.date"]).toBe("To be scheduled");
  });

  it("prefers an explicit recipientEmail and skips dispatch without any email", async () => {
    await dispatchQuoteLifecycle({
      eventKey: "quotes_and_service_authorization.your_quote_is_ready",
      eventId: "evt-q3",
      quote: baseQuote({ customer_email: null }),
      recipientEmail: "explicit@example.com",
      recipientRole: "staff",
      ...baseCtx,
    });
    const event = mockDispatch.mock.calls[0][0] as Record<string, unknown>;
    expect(event.recipientEmail).toBe("explicit@example.com");
    expect(event.recipientRole).toBe("staff");

    mockDispatch.mockClear();
    await dispatchQuoteLifecycle({
      eventKey: "quotes_and_service_authorization.your_quote_is_ready",
      eventId: "evt-q4",
      quote: baseQuote({ customer_email: null }),
      ...baseCtx,
    });
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});

describe("dispatchInvoiceLifecycle", () => {
  beforeEach(() => {
    mockDispatch.mockResolvedValue({ status: "queued" });
  });

  it("builds invoice variables and dispatches to the customer email", async () => {
    await dispatchInvoiceLifecycle({
      eventKey: "invoice_and_payment_sequence.invoice_created",
      eventId: "evt-i1",
      invoice: baseInvoice(),
      ...baseCtx,
    });

    expect(mockDispatch).toHaveBeenCalledTimes(1);
    const event = mockDispatch.mock.calls[0][0] as Record<string, unknown>;
    expect(event.templateKey).toBe("invoice_and_payment_sequence.invoice_created");
    expect(event.entityType).toBe("invoice");
    expect(event.recipientEmail).toBe("customer@example.com");
    expect(event.recipientRole).toBe("customer");
    const variables = event.variables as Record<string, string>;
    expect(variables["invoice.number"]).toBe("INV-42");
    expect(variables["invoice.total"]).toBe("$250.75");
    expect(variables["invoice.balance"]).toBe("$100.25");
    expect(variables["invoice.due_at"]).toBe("2026-10-15");
    expect(variables["payment.amount"]).toBe("$250.75");
    expect(event.metadata).toEqual({ invoiceId: "invoice-uuid-12345678" });
  });

  it("falls back to the full total when no balance override is given", async () => {
    await dispatchInvoiceLifecycle({
      eventKey: "invoice_and_payment_sequence.invoice_created",
      eventId: "evt-i2",
      invoice: baseInvoice({ metadata: {} }),
      ...baseCtx,
    });

    const variables = (mockDispatch.mock.calls[0][0] as Record<string, unknown>)
      .variables as Record<string, string>;
    expect(variables["invoice.balance"]).toBe("$250.75");
    expect(variables["payment.amount"]).toBe("$250.75");
  });

  it("skips dispatch when the invoice has no customer email", async () => {
    await dispatchInvoiceLifecycle({
      eventKey: "invoice_and_payment_sequence.invoice_created",
      eventId: "evt-i3",
      invoice: baseInvoice({ customer_email: null }),
      ...baseCtx,
    });
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});

describe("dispatchPaymentLifecycle", () => {
  beforeEach(() => {
    mockDispatch.mockResolvedValue({ status: "queued" });
  });

  it("builds payment variables including receipt and refund fields", async () => {
    await dispatchPaymentLifecycle({
      eventKey: "invoice_and_payment_sequence.payment_receipt",
      eventId: "evt-p1",
      payment: basePayment(),
      ...baseCtx,
    });

    expect(mockDispatch).toHaveBeenCalledTimes(1);
    const event = mockDispatch.mock.calls[0][0] as Record<string, unknown>;
    expect(event.templateKey).toBe("invoice_and_payment_sequence.payment_receipt");
    expect(event.entityType).toBe("payment");
    expect(event.recipientEmail).toBe("customer@example.com");
    const variables = event.variables as Record<string, string>;
    expect(variables["invoice.number"]).toBe("INV-42");
    expect(variables["payment.amount"]).toBe("$150.00");
    expect(variables["payment.receipt_number"]).toBe("pi_123456");
    expect(variables["payment.date"]).toBe("2026-09-20T10:00:00Z");
    expect(variables["refund.amount"]).toBe("$25.00");
    expect(variables["refund.reference"]).toBe("re_999");
    expect(event.metadata).toEqual({ paymentId: "payment-uuid-12345678", invoiceId: "inv-9" });
  });

  it("falls back when provider payment and invoice ids are missing", async () => {
    await dispatchPaymentLifecycle({
      eventKey: "invoice_and_payment_sequence.payment_receipt",
      eventId: "evt-p2",
      payment: basePayment({ provider_payment_id: null, invoice_id: null, metadata: {} }),
      ...baseCtx,
    });

    const event = mockDispatch.mock.calls[0][0] as Record<string, unknown>;
    const variables = event.variables as Record<string, string>;
    expect(variables["payment.receipt_number"]).toBe("PAYMENT-");
    expect(variables["refund.amount"]).toBe("$150.00");
    expect(variables["refund.reference"]).toBe("PAYMENT-");
    expect(event.metadata).toEqual({ paymentId: "payment-uuid-12345678", invoiceId: "" });
  });

  it("skips dispatch when the payment has no customer email", async () => {
    await dispatchPaymentLifecycle({
      eventKey: "invoice_and_payment_sequence.payment_receipt",
      eventId: "evt-p3",
      payment: basePayment({ customer_email: null }),
      ...baseCtx,
    });
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});

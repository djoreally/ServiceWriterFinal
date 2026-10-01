const mockResolveStripeWorkspaceExecution = jest.fn();
const mockStripePaymentMode = jest.fn();

jest.mock("@/server/payments/stripe-workspace-execution", () => ({
  resolveStripeWorkspaceExecution: (...args: unknown[]) => mockResolveStripeWorkspaceExecution(...args),
  stripePaymentMode: (...args: unknown[]) => mockStripePaymentMode(...args),
}));

import {
  markStripeInvoicePaidOutOfBand,
  syncCanonicalInvoiceToStripe,
} from "@/server/payments/stripe-invoice-sync";

interface Terminal {
  data: unknown;
  error: unknown;
}

// Minimal chainable supabase query fake: every chain method returns the query
// itself, .single() resolves the configured terminal, and awaiting the query
// directly also resolves the terminal.
function chainableQuery(terminal: Terminal): any {
  const q: any = {};
  q.select = jest.fn(() => q);
  q.eq = jest.fn(() => q);
  q.order = jest.fn(() => q);
  q.update = jest.fn(() => q);
  q.single = jest.fn(() => Promise.resolve(terminal));
  q.then = (onF: (v: Terminal) => unknown, onR?: (e: unknown) => unknown) =>
    Promise.resolve(terminal).then(onF, onR);
  return q;
}

function makeSupabase(handlers: Record<string, Terminal | Terminal[]>): { from: jest.Mock; queries: any[] } {
  const queues = new Map<string, Terminal[]>();
  for (const [table, spec] of Object.entries(handlers)) {
    queues.set(table, Array.isArray(spec) ? [...spec] : [spec]);
  }
  const queries: any[] = [];
  const from = jest.fn((table: string) => {
    const queue = queues.get(table);
    const terminal = queue && queue.length > 0 ? queue.shift()! : { data: null, error: null };
    const q = chainableQuery(terminal);
    queries.push(q);
    return q;
  });
  return { from, queries };
}

function findTopLevelUpdate(queries: any[], key: string): any {
  return queries.find(
    (q) => q.update.mock.calls.length > 0 && key in (q.update.mock.calls[0][0] as Record<string, unknown>),
  );
}

function findMetadataUpdate(queries: any[], metaKey: string): any {
  return queries.find((q) => {
    if (q.update.mock.calls.length === 0) return false;
    const metadata = (q.update.mock.calls[0][0] as Record<string, any>).metadata;
    return metadata !== null && typeof metadata === "object" && metaKey in metadata;
  });
}

const ACCOUNT = { id: "acct_123", charges_enabled: true, payouts_enabled: true, details_submitted: true };
const OK: Terminal = { data: null, error: null };

function makeExecution(mode: "connect" | "direct" = "connect", accountId = "acct_123") {
  const stripe = {
    accounts: { retrieve: jest.fn().mockResolvedValue(ACCOUNT) },
    customers: {
      retrieve: jest.fn().mockResolvedValue({ id: "cus_existing", deleted: false }),
      create: jest.fn().mockResolvedValue({ id: "cus_new_1" }),
    },
    invoices: {
      retrieve: jest.fn().mockResolvedValue({ id: "in_old", status: "open", hosted_invoice_url: "https://pay.stripe.com/old" }),
      create: jest.fn().mockResolvedValue({ id: "in_new_1", status: "draft", hosted_invoice_url: null }),
      finalizeInvoice: jest.fn().mockResolvedValue({
        id: "in_new_1",
        status: "open",
        hosted_invoice_url: "https://pay.stripe.com/new",
      }),
      pay: jest.fn().mockResolvedValue({ id: "in_1", status: "paid" }),
    },
    invoiceItems: { create: jest.fn().mockResolvedValue({}) },
  };
  const execution = {
    mode,
    stripe,
    accountId,
    requestOptions: (key?: string) => (key ? { idempotencyKey: key } : {}),
  };
  return { stripe, execution };
}

const SETTINGS = {
  payment_provider: "stripe",
  operational_settings: { stripe_payment_mode: "connect", stripe_account_id: "acct_123" },
};
const INVOICE = {
  id: "inv_1",
  customer_id: "cust_1",
  invoice_number: "1001",
  tax_total: 8,
  total: 108,
  metadata: {},
};
const PAYMENT = { id: "pay_1", currency_code: "USD", metadata: {} };
const CUSTOMER = {
  id: "cust_1",
  first_name: "Jane",
  last_name: "Doe",
  company_name: null,
  email: "jane@example.com",
  phone: null,
  address_line1: null,
  address_line2: null,
  city: null,
  region: null,
  postal_code: null,
  country_code: null,
  metadata: {},
};
const LINES = [
  { id: "line_1", description: "Oil change", quantity: 1, unit_price: 100, sort_order: 1 },
  { id: "line_2", description: "Zero line", quantity: 2, unit_price: 0, sort_order: 2 },
];

function happyPathSupabase(overrides: Record<string, Terminal | Terminal[]> = {}) {
  return makeSupabase({
    workspace_settings: [{ data: SETTINGS, error: null }, OK],
    invoices: [{ data: INVOICE, error: null }, OK],
    payments: [{ data: PAYMENT, error: null }, OK],
    customers: [{ data: CUSTOMER, error: null }, OK],
    invoice_lines: [{ data: LINES, error: null }],
    ...overrides,
  });
}

describe("syncCanonicalInvoiceToStripe", () => {
  beforeEach(() => {
    mockStripePaymentMode.mockReturnValue("connect");
  });

  it("skips when the provider is not stripe", async () => {
    const { stripe, execution } = makeExecution();
    mockResolveStripeWorkspaceExecution.mockReturnValue(execution);
    const { from } = makeSupabase({
      workspace_settings: [{ data: { ...SETTINGS, payment_provider: "none" }, error: null }],
    });
    const result = await syncCanonicalInvoiceToStripe({
      supabase: { from } as any,
      workspaceId: "ws_1",
      invoiceId: "inv_1",
      paymentId: "pay_1",
    });
    expect(result).toEqual({ provider: "none", status: "skipped" });
    expect(mockResolveStripeWorkspaceExecution).not.toHaveBeenCalled();
    expect(stripe.accounts.retrieve).not.toHaveBeenCalled();
  });

  it("throws when workspace settings cannot be read", async () => {
    mockResolveStripeWorkspaceExecution.mockReturnValue(makeExecution().execution);
    const { from } = makeSupabase({
      workspace_settings: [{ data: null, error: new Error("db down") }],
    });
    await expect(
      syncCanonicalInvoiceToStripe({ supabase: { from } as any, workspaceId: "ws_1", invoiceId: "inv_1", paymentId: "pay_1" }),
    ).rejects.toThrow("db down");
  });

  it("throws when the stripe account cannot accept charges", async () => {
    const { stripe, execution } = makeExecution();
    stripe.accounts.retrieve.mockResolvedValueOnce({ ...ACCOUNT, charges_enabled: false });
    mockResolveStripeWorkspaceExecution.mockReturnValue(execution);
    const { from, queries } = happyPathSupabase();
    await expect(
      syncCanonicalInvoiceToStripe({ supabase: { from } as any, workspaceId: "ws_1", invoiceId: "inv_1", paymentId: "pay_1" }),
    ).rejects.toThrow("Connected Stripe account is not enabled to accept charges.");
    // workspace state is still refreshed before the charges check
    expect(findTopLevelUpdate(queries, "operational_settings")).toBeDefined();
  });

  it("uses the workspace wording when direct mode cannot accept charges", async () => {
    const { stripe, execution } = makeExecution("direct", "acct_direct");
    stripe.accounts.retrieve.mockResolvedValueOnce({ ...ACCOUNT, id: "acct_direct", charges_enabled: false });
    mockResolveStripeWorkspaceExecution.mockReturnValue(execution);
    const { from } = happyPathSupabase();
    await expect(
      syncCanonicalInvoiceToStripe({ supabase: { from } as any, workspaceId: "ws_1", invoiceId: "inv_1", paymentId: "pay_1" }),
    ).rejects.toThrow("Workspace Stripe account is not enabled to accept charges.");
  });

  it("throws when the canonical invoice or payment is missing", async () => {
    mockResolveStripeWorkspaceExecution.mockReturnValue(makeExecution().execution);
    const { from } = happyPathSupabase({ invoices: [{ data: null, error: null }] });
    await expect(
      syncCanonicalInvoiceToStripe({ supabase: { from } as any, workspaceId: "ws_1", invoiceId: "inv_1", paymentId: "pay_1" }),
    ).rejects.toThrow("Canonical invoice not found");

    const { from: from2 } = happyPathSupabase({ payments: [{ data: null, error: new Error("pay missing") }] });
    await expect(
      syncCanonicalInvoiceToStripe({ supabase: { from: from2 } as any, workspaceId: "ws_1", invoiceId: "inv_1", paymentId: "pay_1" }),
    ).rejects.toThrow("pay missing");
  });

  it("throws when the invoice has no customer", async () => {
    mockResolveStripeWorkspaceExecution.mockReturnValue(makeExecution().execution);
    const { from } = happyPathSupabase({ invoices: [{ data: { ...INVOICE, customer_id: null }, error: null }] });
    await expect(
      syncCanonicalInvoiceToStripe({ supabase: { from } as any, workspaceId: "ws_1", invoiceId: "inv_1", paymentId: "pay_1" }),
    ).rejects.toThrow("Canonical invoice has no customer.");
  });

  it("creates a stripe customer, invoice, line items and finalizes on the happy path", async () => {
    const { stripe, execution } = makeExecution();
    mockResolveStripeWorkspaceExecution.mockReturnValue(execution);
    const { from, queries } = happyPathSupabase();

    const result = await syncCanonicalInvoiceToStripe({
      supabase: { from } as any,
      workspaceId: "ws_1",
      appointmentId: "appt_9",
      invoiceId: "inv_1",
      paymentId: "pay_1",
    });

    expect(stripe.customers.create).toHaveBeenCalledWith(
      {
        email: "jane@example.com",
        name: "Jane Doe",
        phone: undefined,
        address: undefined,
        metadata: { servicewriter_customer_id: "cust_1", workspace_id: "ws_1" },
      },
      { idempotencyKey: "sw-customer-cust_1" },
    );

    expect(stripe.invoices.create).toHaveBeenCalledWith(
      {
        customer: "cus_new_1",
        collection_method: "send_invoice",
        days_until_due: 1,
        auto_advance: false,
        description: "Service Writer invoice #1001",
        metadata: {
          servicewriter_invoice_id: "inv_1",
          payment_id: "pay_1",
          workspace_id: "ws_1",
          appointment_id: "appt_9",
          servicewriter_payment_mode: "connect",
        },
      },
      { idempotencyKey: "sw-invoice-inv_1" },
    );

    // $100 line item, $8 tax item; the $0 line is skipped; no adjustment needed
    expect(stripe.invoiceItems.create).toHaveBeenCalledTimes(2);
    expect(stripe.invoiceItems.create).toHaveBeenCalledWith(
      {
        customer: "cus_new_1",
        invoice: "in_new_1",
        amount: 10000,
        currency: "usd",
        description: "Oil change",
        metadata: { servicewriter_invoice_line_id: "line_1", workspace_id: "ws_1" },
      },
      { idempotencyKey: "sw-invoice-line-line_1" },
    );
    expect(stripe.invoiceItems.create).toHaveBeenCalledWith(
      {
        customer: "cus_new_1",
        invoice: "in_new_1",
        amount: 800,
        currency: "usd",
        description: "Tax",
        metadata: { workspace_id: "ws_1" },
      },
      { idempotencyKey: "sw-invoice-tax-inv_1" },
    );

    expect(stripe.invoices.finalizeInvoice).toHaveBeenCalledWith(
      "in_new_1",
      {},
      { idempotencyKey: "sw-invoice-finalize-inv_1" },
    );

    const invoiceUpdate = findMetadataUpdate(queries, "stripe_invoice_id");
    expect(invoiceUpdate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          stripe_customer_id: "cus_new_1",
          stripe_invoice_id: "in_new_1",
          stripe_account_id: "acct_123",
          stripe_payment_mode: "connect",
          stripe_hosted_invoice_url: "https://pay.stripe.com/new",
          stripe_invoice_status: "open",
          stripe_sync_status: "synced",
        }),
      }),
    );
    const paymentUpdate = queries.find(
      (q) => q.update.mock.calls.length > 0 && "provider" in (q.update.mock.calls[0][0] as Record<string, unknown>),
    );
    expect(paymentUpdate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "stripe",
        metadata: expect.objectContaining({
          stripe_invoice_id: "in_new_1",
          payment_url: "https://pay.stripe.com/new",
        }),
      }),
    );

    expect(result).toEqual({
      provider: "stripe",
      status: "synced",
      paymentMode: "connect",
      stripeAccountId: "acct_123",
      stripeCustomerId: "cus_new_1",
      stripeInvoiceId: "in_new_1",
      hostedInvoiceUrl: "https://pay.stripe.com/new",
      invoiceStatus: "open",
    });
  });

  it("adds an invoice adjustment line when lines and tax do not match the total", async () => {
    const { stripe, execution } = makeExecution();
    mockResolveStripeWorkspaceExecution.mockReturnValue(execution);
    const { from } = happyPathSupabase({ invoices: [{ data: { ...INVOICE, total: 110 }, error: null }] });

    await syncCanonicalInvoiceToStripe({
      supabase: { from } as any,
      workspaceId: "ws_1",
      invoiceId: "inv_1",
      paymentId: "pay_1",
    });

    expect(stripe.invoiceItems.create).toHaveBeenCalledWith(
      {
        customer: "cus_new_1",
        invoice: "in_new_1",
        amount: 200,
        currency: "usd",
        description: "Invoice adjustment",
        metadata: { workspace_id: "ws_1" },
      },
      { idempotencyKey: "sw-invoice-adjustment-inv_1" },
    );
  });

  it("reuses an existing stripe customer when it is still valid", async () => {
    const { stripe, execution } = makeExecution();
    mockResolveStripeWorkspaceExecution.mockReturnValue(execution);
    const { from } = happyPathSupabase({
      customers: [{
        data: { ...CUSTOMER, metadata: { stripe_customer_id: "cus_existing", stripe_account_id: "acct_123" } },
        error: null,
      }],
    });

    await syncCanonicalInvoiceToStripe({
      supabase: { from } as any,
      workspaceId: "ws_1",
      invoiceId: "inv_1",
      paymentId: "pay_1",
    });

    expect(stripe.customers.retrieve).toHaveBeenCalledWith("cus_existing", {}, {});
    expect(stripe.customers.create).not.toHaveBeenCalled();
    expect(stripe.invoices.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_existing" }),
      expect.anything(),
    );
  });

  it("creates a new customer when the stored one is deleted or belongs to another account", async () => {
    for (const metadata of [
      { stripe_customer_id: "cus_existing", stripe_account_id: "acct_other" },
      { stripe_customer_id: "not-a-cus-id", stripe_account_id: "acct_123" },
    ]) {
      const { stripe, execution } = makeExecution();
      stripe.customers.retrieve.mockResolvedValueOnce({ id: "cus_existing", deleted: true });
      mockResolveStripeWorkspaceExecution.mockReturnValue(execution);
      const { from } = happyPathSupabase({
        customers: [{ data: { ...CUSTOMER, metadata }, error: null }],
      });
      await syncCanonicalInvoiceToStripe({
        supabase: { from } as any,
        workspaceId: "ws_1",
        invoiceId: "inv_1",
        paymentId: "pay_1",
      });
      expect(stripe.customers.create).toHaveBeenCalled();
    }
  });

  it("reuses a stored stripe invoice and skips item creation when it is not a draft", async () => {
    const { stripe, execution } = makeExecution();
    mockResolveStripeWorkspaceExecution.mockReturnValue(execution);
    const { from } = happyPathSupabase({
      invoices: [{
        data: { ...INVOICE, metadata: { stripe_invoice_id: "in_old", stripe_account_id: "acct_123" } },
        error: null,
      }],
    });

    const result = await syncCanonicalInvoiceToStripe({
      supabase: { from } as any,
      workspaceId: "ws_1",
      invoiceId: "inv_1",
      paymentId: "pay_1",
    });

    expect(stripe.invoices.retrieve).toHaveBeenCalledWith("in_old", {}, {});
    expect(stripe.invoices.create).not.toHaveBeenCalled();
    expect(stripe.invoiceItems.create).not.toHaveBeenCalled();
    expect(stripe.invoices.finalizeInvoice).not.toHaveBeenCalled();
    expect(result.stripeInvoiceId).toBe("in_old");
    expect(result.invoiceStatus).toBe("open");
  });

  it("falls back to creating a new invoice when the stored one cannot be retrieved", async () => {
    const { stripe, execution } = makeExecution();
    stripe.invoices.retrieve.mockRejectedValueOnce(new Error("no such invoice"));
    mockResolveStripeWorkspaceExecution.mockReturnValue(execution);
    const { from } = happyPathSupabase({
      invoices: [{
        data: { ...INVOICE, metadata: { stripe_invoice_id: "in_gone", stripe_account_id: "acct_123" } },
        error: null,
      }],
    });

    await syncCanonicalInvoiceToStripe({
      supabase: { from } as any,
      workspaceId: "ws_1",
      invoiceId: "inv_1",
      paymentId: "pay_1",
    });
    expect(stripe.invoices.create).toHaveBeenCalled();
  });

  it("propagates stripe errors without writing sync metadata", async () => {
    const { stripe, execution } = makeExecution();
    stripe.invoices.create.mockRejectedValueOnce(new Error("stripe boom"));
    mockResolveStripeWorkspaceExecution.mockReturnValue(execution);
    const { from, queries } = happyPathSupabase();

    await expect(
      syncCanonicalInvoiceToStripe({ supabase: { from } as any, workspaceId: "ws_1", invoiceId: "inv_1", paymentId: "pay_1" }),
    ).rejects.toThrow("stripe boom");
    expect(findMetadataUpdate(queries, "stripe_invoice_id")).toBeUndefined();
  });
});

describe("markStripeInvoicePaidOutOfBand", () => {
  function oobSupabase(invoiceMetadata: Record<string, unknown>) {
    return makeSupabase({
      workspace_settings: [{ data: SETTINGS, error: null }],
      invoices: [{ data: { id: "inv_1", metadata: invoiceMetadata }, error: null }],
    });
  }

  beforeEach(() => {
    mockStripePaymentMode.mockReturnValue("connect");
  });

  it("skips when no invoice id is given", async () => {
    const { stripe } = makeExecution();
    mockResolveStripeWorkspaceExecution.mockReturnValue(makeExecution().execution);
    const { from } = oobSupabase({});
    const result = await markStripeInvoicePaidOutOfBand({
      supabase: { from } as any,
      workspaceId: "ws_1",
      invoiceId: null,
    });
    expect(result).toEqual({ status: "skipped" });
    expect(from).not.toHaveBeenCalled();
    expect(stripe.invoices.retrieve).not.toHaveBeenCalled();
  });

  it("skips when the provider is not stripe", async () => {
    mockResolveStripeWorkspaceExecution.mockReturnValue(makeExecution().execution);
    const { from } = makeSupabase({
      workspace_settings: [{ data: { ...SETTINGS, payment_provider: "none" }, error: null }],
      invoices: [{ data: { id: "inv_1", metadata: {} }, error: null }],
    });
    const result = await markStripeInvoicePaidOutOfBand({
      supabase: { from } as any,
      workspaceId: "ws_1",
      invoiceId: "inv_1",
    });
    expect(result).toEqual({ status: "skipped" });
  });

  it("skips when the invoice has no stored stripe invoice or a different account", async () => {
    for (const metadata of [{}, { stripe_invoice_id: "in_1", stripe_account_id: "acct_other" }]) {
      const { stripe, execution } = makeExecution();
      mockResolveStripeWorkspaceExecution.mockReturnValue(execution);
      const { from } = oobSupabase(metadata);
      const result = await markStripeInvoicePaidOutOfBand({
        supabase: { from } as any,
        workspaceId: "ws_1",
        invoiceId: "inv_1",
      });
      expect(result).toEqual({ status: "skipped" });
      expect(stripe.invoices.retrieve).not.toHaveBeenCalled();
    }
  });

  it("throws when the invoice cannot be found", async () => {
    mockResolveStripeWorkspaceExecution.mockReturnValue(makeExecution().execution);
    const { from } = makeSupabase({
      workspace_settings: [{ data: SETTINGS, error: null }],
      invoices: [{ data: null, error: null }],
    });
    await expect(
      markStripeInvoicePaidOutOfBand({ supabase: { from } as any, workspaceId: "ws_1", invoiceId: "inv_1" }),
    ).rejects.toThrow("Invoice not found");
  });

  it("marks an open invoice paid out of band", async () => {
    const { stripe, execution } = makeExecution();
    stripe.invoices.retrieve.mockResolvedValueOnce({ id: "in_1", status: "open" });
    mockResolveStripeWorkspaceExecution.mockReturnValue(execution);
    const { from } = oobSupabase({ stripe_invoice_id: "in_1", stripe_account_id: "acct_123" });

    const result = await markStripeInvoicePaidOutOfBand({
      supabase: { from } as any,
      workspaceId: "ws_1",
      invoiceId: "inv_1",
    });

    expect(stripe.invoices.pay).toHaveBeenCalledWith(
      "in_1",
      { paid_out_of_band: true },
      { idempotencyKey: "sw-invoice-oob-paid-inv_1" },
    );
    expect(result).toEqual({ status: "synced", stripeInvoiceId: "in_1", paymentMode: "connect" });
  });

  it("does not re-pay invoices that are already paid or void", async () => {
    for (const status of ["paid", "void"]) {
      const { stripe, execution } = makeExecution();
      stripe.invoices.retrieve.mockResolvedValueOnce({ id: "in_1", status });
      mockResolveStripeWorkspaceExecution.mockReturnValue(execution);
      const { from } = oobSupabase({ stripe_invoice_id: "in_1", stripe_account_id: "acct_123" });
      const result = await markStripeInvoicePaidOutOfBand({
        supabase: { from } as any,
        workspaceId: "ws_1",
        invoiceId: "inv_1",
      });
      expect(stripe.invoices.pay).not.toHaveBeenCalled();
      expect(result).toEqual({ status: "synced", stripeInvoiceId: "in_1", paymentMode: "connect" });
    }
  });
});

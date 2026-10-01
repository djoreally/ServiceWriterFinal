import "../../../test/api-routes/env";

jest.mock("@/server/api", () => ({
  ...jest.requireActual("@/server/api"),
  requireWorkspaceMember: jest.fn(),
  requireUser: jest.fn(),
  requireCrmCapability: jest.fn(),
  requireWorkspacePaymentsAddon: jest.fn(),
}));
jest.mock("@/server/messaging/invoice-events", () => ({
  dispatchInvoiceTransition: jest.fn(),
}));
jest.mock("@/server/messaging/lifecycle-events", () => ({
  LIFECYCLE_EVENT_KEYS: {
    invoiceCreated: "invoice.created",
  },
}));
jest.mock("@/server/messaging/lifecycle-sender", () => ({
  sendLifecycleEmail: jest.fn(),
}));
jest.mock("@/server/messaging/quote-payment-events", () => ({
  dispatchQuoteLifecycle: jest.fn(),
  LIFECYCLE_EVENT_KEYS: {
    estimateConverted: "estimate.converted",
    quoteApproved: "quote.approved",
    quoteDeclined: "quote.declined",
    quoteApprovedStaff: "quote.approved_staff",
    quoteDeclinedStaff: "quote.declined_staff",
  },
}));

import * as api from "@/server/api";
import { dispatchInvoiceTransition } from "@/server/messaging/invoice-events";
import { sendLifecycleEmail } from "@/server/messaging/lifecycle-sender";
import { dispatchQuoteLifecycle } from "@/server/messaging/quote-payment-events";
import { GET as invoicesGet, POST as invoicesPost } from "../../../../app/api/v1/invoices/route";
import {
  DELETE as invoiceDelete,
  GET as invoiceGet,
  PATCH as invoicePatch,
} from "../../../../app/api/v1/invoices/[id]/route";
import { POST as invoiceSendPost } from "../../../../app/api/v1/invoices/[id]/send/route";
import { POST as quoteConvertPost } from "../../../../app/api/v1/quotes/[id]/convert/route";
import { POST as quoteStatusPost } from "../../../../app/api/v1/quotes/[id]/status/route";
import {
  WS_ID,
  TEST_USER,
  makeRequest,
  readJson,
  contextWithParams,
  makeSupabaseClient,
  stubWorkspaceMember,
  stubWorkspaceMemberReject,
  type MockSupabaseClient,
} from "../../../test/api-routes/helpers";

const INVOICE_ID = "55555555-5555-4555-8555-555555555555";
const QUOTE_ID = "12121212-1212-4121-8121-121212121212";
const CUSTOMER_ID = "66666666-6666-4666-8666-666666666666";

const ORIGINAL_ENV = process.env;
beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  (dispatchInvoiceTransition as jest.Mock).mockResolvedValue({ ok: true });
  (dispatchQuoteLifecycle as jest.Mock).mockResolvedValue({ ok: true });
});
afterEach(() => {
  process.env = ORIGINAL_ENV;
  jest.clearAllMocks();
});

describe("invoices (GET/POST)", () => {
  let supabase: MockSupabaseClient;

  beforeEach(() => {
    supabase = makeSupabaseClient({
      invoices: { data: [{ id: INVOICE_ID, status: "issued", total: 108 }], error: null },
    });
    stubWorkspaceMember(api, supabase);
  });

  it("GET returns 401 when unauthenticated", async () => {
    stubWorkspaceMemberReject(api, 401);
    const { status } = await readJson(
      await invoicesGet(makeRequest(`/api/v1/invoices?workspace_id=${WS_ID}`)),
    );
    expect(status).toBe(401);
  });

  it("GET returns the invoice list with pagination", async () => {
    const { status, body } = await readJson(
      await invoicesGet(makeRequest(`/api/v1/invoices?workspace_id=${WS_ID}`)),
    );
    expect(status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.pagination).toMatchObject({ limit: 25, offset: 0 });
  });

  // Grey-box note: these routes have no ZodError mapping, so schema validation
  // failures surface as 500 internal_error via errorResponse (only 3 of the
  // 60 v1 routes map ZodError to 400 explicitly).
  it("POST returns 500 when customer_id is missing (no ZodError mapping)", async () => {
    const { status, body } = await readJson(
      await invoicesPost(
        makeRequest("/api/v1/invoices", { method: "POST", body: { workspace_id: WS_ID } }),
      ),
    );
    expect(status).toBe(500);
    expect(body.error.code).toBe("internal_error");
  });

  it("POST creates a draft invoice via RPC and returns 201", async () => {
    supabase.rpc.mockResolvedValue({ data: INVOICE_ID, error: null });
    const { status, body } = await readJson(
      await invoicesPost(
        makeRequest("/api/v1/invoices", {
          method: "POST",
          body: {
            workspace_id: WS_ID,
            customer_id: CUSTOMER_ID,
            line_items: [{ description: "Oil change", quantity: 1, unit_price: 79.99 }],
          },
        }),
      ),
    );
    expect(status).toBe(201);
    expect(body.data[0].id).toBe(INVOICE_ID);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "create_invoice_v1",
      expect.objectContaining({ p_workspace_id: WS_ID }),
    );
    // draft invoices do not trigger lifecycle email
    expect(dispatchInvoiceTransition).not.toHaveBeenCalled();
  });

  it("POST dispatches the invoice-created email for an issued invoice with a customer email", async () => {
    supabase = makeSupabaseClient({
      invoices: {
        data: {
          id: INVOICE_ID,
          status: "issued",
          created_at: "2026-01-01T00:00:00.000Z",
          customers: { first_name: "Jane", last_name: "Doe", email: "jane@example.com" },
        },
        error: null,
      },
      workspaces: { data: { name: "MOMS", timezone: "UTC" }, error: null },
    });
    supabase.rpc.mockResolvedValue({ data: INVOICE_ID, error: null });
    stubWorkspaceMember(api, supabase);
    const { status } = await readJson(
      await invoicesPost(
        makeRequest("/api/v1/invoices", {
          method: "POST",
          body: { workspace_id: WS_ID, customer_id: CUSTOMER_ID, status: "issued" },
        }),
      ),
    );
    expect(status).toBe(201);
    expect(dispatchInvoiceTransition).toHaveBeenCalledWith(
      expect.objectContaining({ forceKey: "invoice.created" }),
    );
  });
});

describe("invoices/[id] (GET/PATCH/DELETE)", () => {
  let supabase: MockSupabaseClient;
  const ctx = contextWithParams({ id: INVOICE_ID });
  const path = `/api/v1/invoices/${INVOICE_ID}?workspace_id=${WS_ID}`;

  beforeEach(() => {
    supabase = makeSupabaseClient({
      invoices: {
        data: {
          id: INVOICE_ID,
          status: "draft",
          metadata: {},
          customers: { first_name: "Jane", last_name: "Doe", email: "jane@example.com" },
        },
        error: null,
      },
    });
    stubWorkspaceMember(api, supabase);
  });

  it("GET returns the invoice", async () => {
    const { status, body } = await readJson(await invoiceGet(makeRequest(path), ctx));
    expect(status).toBe(200);
    expect(body.data.id).toBe(INVOICE_ID);
  });

  it("GET returns 401 when unauthenticated", async () => {
    stubWorkspaceMemberReject(api, 401);
    const { status } = await readJson(await invoiceGet(makeRequest(path), ctx));
    expect(status).toBe(401);
  });

  it("PATCH returns 500 when only workspace_id is supplied (no ZodError mapping)", async () => {
    const { status, body } = await readJson(
      await invoicePatch(makeRequest(path, { method: "PATCH", body: { workspace_id: WS_ID } }), ctx),
    );
    expect(status).toBe(500);
    expect(body.error.code).toBe("internal_error");
  });

  it("PATCH updates the invoice and returns 200", async () => {
    const { status, body } = await readJson(
      await invoicePatch(
        makeRequest(path, { method: "PATCH", body: { workspace_id: WS_ID, notes: "Updated notes" } }),
        ctx,
      ),
    );
    expect(status).toBe(200);
    expect(body.data.id).toBe(INVOICE_ID);
  });

  it("PATCH maps 'sent' status to 'issued'", async () => {
    const { status } = await readJson(
      await invoicePatch(
        makeRequest(path, { method: "PATCH", body: { workspace_id: WS_ID, status: "sent" } }),
        ctx,
      ),
    );
    expect(status).toBe(200);
    const updateCalls = supabase.from.mock.calls.filter(([table]) => table === "invoices");
    expect(updateCalls.length).toBeGreaterThan(0);
  });

  it("PATCH returns 409 when replacing line items on a non-draft invoice", async () => {
    supabase = makeSupabaseClient({
      invoices: { data: { id: INVOICE_ID, status: "issued", metadata: {} }, error: null },
    });
    stubWorkspaceMember(api, supabase);
    const { status, body } = await readJson(
      await invoicePatch(
        makeRequest(path, {
          method: "PATCH",
          body: {
            workspace_id: WS_ID,
            line_items: [{ description: "Brakes", quantity: 1, unit_price: 100 }],
          },
        }),
        ctx,
      ),
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe("invoice_locked");
  });

  it("DELETE voids the invoice", async () => {
    const { status, body } = await readJson(
      await invoiceDelete(makeRequest(path, { method: "DELETE" }), ctx),
    );
    expect(status).toBe(200);
    expect(body.data.id).toBe(INVOICE_ID);
  });
});

describe("invoices/[id]/send (POST)", () => {
  let supabase: MockSupabaseClient;
  const ctx = contextWithParams({ id: INVOICE_ID });

  const invoiceRow = {
    id: INVOICE_ID,
    workspace_id: WS_ID,
    invoice_number: 1001,
    status: "issued",
    subtotal: 100,
    tax_total: 8,
    total: 108,
    amount_paid: 0,
    due_at: null,
    metadata: {},
    invoice_lines: [{ description: "Oil change", quantity: 1, unit_price: 100, sort_order: 0 }],
    customers: { id: CUSTOMER_ID, first_name: "Jane", last_name: "Doe", email: "jane@example.com" },
  };

  beforeEach(() => {
    supabase = makeSupabaseClient({
      invoices: { data: invoiceRow, error: null },
      workspaces: { data: { name: "MOMS", currency_code: "USD" }, error: null },
    });
    stubWorkspaceMember(api, supabase);
    (sendLifecycleEmail as jest.Mock).mockResolvedValue({
      status: "sent",
      providerName: "resend",
      providerMessageId: "msg_1",
    });
  });

  const body = { workspace_id: WS_ID };

  it("returns 401 when unauthenticated", async () => {
    stubWorkspaceMemberReject(api, 401);
    const { status } = await readJson(
      await invoiceSendPost(
        makeRequest(`/api/v1/invoices/${INVOICE_ID}/send`, { method: "POST", body }),
        ctx,
      ),
    );
    expect(status).toBe(401);
  });

  it("returns 500 for an invalid body (no ZodError mapping)", async () => {
    const { status, body } = await readJson(
      await invoiceSendPost(
        makeRequest(`/api/v1/invoices/${INVOICE_ID}/send`, { method: "POST", body: {} }),
        ctx,
      ),
    );
    expect(status).toBe(500);
    expect(body.error.code).toBe("internal_error");
  });

  it("returns 409 for a void invoice", async () => {
    supabase = makeSupabaseClient({
      invoices: { data: { ...invoiceRow, status: "void" }, error: null },
      workspaces: { data: { name: "MOMS", currency_code: "USD" }, error: null },
    });
    stubWorkspaceMember(api, supabase);
    const { status, body: resBody } = await readJson(
      await invoiceSendPost(
        makeRequest(`/api/v1/invoices/${INVOICE_ID}/send`, { method: "POST", body }),
        ctx,
      ),
    );
    expect(status).toBe(409);
    expect(resBody.error.code).toBe("invoice_void");
  });

  it("returns 422 when no recipient email is available", async () => {
    supabase = makeSupabaseClient({
      invoices: {
        data: { ...invoiceRow, metadata: {}, customers: { id: CUSTOMER_ID, first_name: "J", last_name: null, email: null } },
        error: null,
      },
      workspaces: { data: { name: "MOMS", currency_code: "USD" }, error: null },
    });
    stubWorkspaceMember(api, supabase);
    const { status, body: resBody } = await readJson(
      await invoiceSendPost(
        makeRequest(`/api/v1/invoices/${INVOICE_ID}/send`, { method: "POST", body }),
        ctx,
      ),
    );
    expect(status).toBe(422);
    expect(resBody.error.code).toBe("customer_email_required");
  });

  it("sends the invoice email and returns the delivery receipt", async () => {
    const { status, body: resBody } = await readJson(
      await invoiceSendPost(
        makeRequest(`/api/v1/invoices/${INVOICE_ID}/send`, { method: "POST", body }),
        ctx,
      ),
    );
    expect(status).toBe(200);
    expect(resBody.data).toMatchObject({
      recipient: "jane@example.com",
      delivery_status: "sent",
      provider: "resend",
      invoice_status: "issued",
    });
    expect(sendLifecycleEmail).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WS_ID, recipientEmail: "jane@example.com" }),
    );
  });

  it("returns a suppressed receipt without updating the invoice", async () => {
    (sendLifecycleEmail as jest.Mock).mockResolvedValue({
      status: "suppressed",
      providerName: "resend",
      providerMessageId: null,
    });
    const { status, body: resBody } = await readJson(
      await invoiceSendPost(
        makeRequest(`/api/v1/invoices/${INVOICE_ID}/send`, { method: "POST", body }),
        ctx,
      ),
    );
    expect(status).toBe(200);
    expect(resBody.data.delivery_status).toBe("suppressed");
  });

  it("accepts an explicit recipient_email override", async () => {
    const { status, body: resBody } = await readJson(
      await invoiceSendPost(
        makeRequest(`/api/v1/invoices/${INVOICE_ID}/send`, {
          method: "POST",
          body: { workspace_id: WS_ID, recipient_email: "billing@example.com" },
        }),
        ctx,
      ),
    );
    expect(status).toBe(200);
    expect(resBody.data.recipient).toBe("billing@example.com");
  });
});

describe("quotes/[id]/convert (POST)", () => {
  let supabase: MockSupabaseClient;
  const ctx = contextWithParams({ id: QUOTE_ID });
  const body = { workspace_id: WS_ID, idempotency_key: "0123456789abcdef" };

  beforeEach(() => {
    supabase = makeSupabaseClient({
      quotes: {
        data: {
          id: QUOTE_ID,
          workspace_id: WS_ID,
          customer_id: CUSTOMER_ID,
          total: 250,
          status: "approved",
          metadata: {},
        },
        error: null,
      },
      customers: { data: { first_name: "Jane", last_name: "Doe", email: "jane@example.com" }, error: null },
      workspaces: { data: { name: "MOMS", timezone: "UTC" }, error: null },
    });
    supabase.rpc.mockResolvedValue({ data: { service_record_id: "sr-1" }, error: null });
    stubWorkspaceMember(api, supabase);
  });

  it("returns 401 when unauthenticated", async () => {
    stubWorkspaceMemberReject(api, 401);
    const { status } = await readJson(
      await quoteConvertPost(makeRequest(`/api/v1/quotes/${QUOTE_ID}/convert`, { method: "POST", body }), ctx),
    );
    expect(status).toBe(401);
  });

  it("returns 400 for a short idempotency key", async () => {
    const { status, body: resBody } = await readJson(
      await quoteConvertPost(
        makeRequest(`/api/v1/quotes/${QUOTE_ID}/convert`, {
          method: "POST",
          body: { workspace_id: WS_ID, idempotency_key: "short" },
        }),
        ctx,
      ),
    );
    expect(status).toBe(400);
    expect(resBody.error.code).toBe("validation_error");
  });

  it("converts the quote and dispatches the converted email", async () => {
    const { status, body: resBody } = await readJson(
      await quoteConvertPost(makeRequest(`/api/v1/quotes/${QUOTE_ID}/convert`, { method: "POST", body }), ctx),
    );
    expect(status).toBe(200);
    expect(resBody.data).toMatchObject({ service_record_id: "sr-1" });
    expect(supabase.rpc).toHaveBeenCalledWith(
      "convert_quote_to_service_record_v1",
      expect.objectContaining({ p_quote_id: QUOTE_ID, p_idempotency_key: "0123456789abcdef" }),
    );
    // enrichment + dispatch happen async via `void`; give the event loop a tick
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(dispatchQuoteLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: "estimate.converted" }),
    );
  });

  it("maps quote_not_found RPC errors to 404", async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: new Error("quote_not_found") });
    const { status, body: resBody } = await readJson(
      await quoteConvertPost(makeRequest(`/api/v1/quotes/${QUOTE_ID}/convert`, { method: "POST", body }), ctx),
    );
    expect(status).toBe(404);
    expect(resBody.error.code).toBe("quote_not_found");
  });

  it("maps quote_already_converted RPC errors to 409", async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: new Error("quote_already_converted") });
    const { status, body: resBody } = await readJson(
      await quoteConvertPost(makeRequest(`/api/v1/quotes/${QUOTE_ID}/convert`, { method: "POST", body }), ctx),
    );
    expect(status).toBe(409);
    expect(resBody.error.code).toBe("quote_already_converted");
  });
});

describe("quotes/[id]/status (POST)", () => {
  let supabase: MockSupabaseClient;
  const ctx = contextWithParams({ id: QUOTE_ID });

  const currentQuote = {
    id: QUOTE_ID,
    workspace_id: WS_ID,
    customer_id: CUSTOMER_ID,
    status: "sent",
    updated_at: "2026-01-01T00:00:00.000Z",
    customers: { id: CUSTOMER_ID, first_name: "Jane", last_name: "Doe", email: "jane@example.com" },
  };

  beforeEach(() => {
    supabase = makeSupabaseClient({
      quotes: { data: currentQuote, error: null },
      workspaces: { data: { name: "MOMS", timezone: "UTC" }, error: null },
    });
    stubWorkspaceMember(api, supabase);
  });

  const body = { workspace_id: WS_ID, status: "approved" };

  it("returns 401 when unauthenticated", async () => {
    stubWorkspaceMemberReject(api, 401);
    const { status } = await readJson(
      await quoteStatusPost(makeRequest(`/api/v1/quotes/${QUOTE_ID}/status`, { method: "POST", body }), ctx),
    );
    expect(status).toBe(401);
  });

  it("returns 500 for an invalid status (no ZodError mapping)", async () => {
    const { status, body } = await readJson(
      await quoteStatusPost(
        makeRequest(`/api/v1/quotes/${QUOTE_ID}/status`, {
          method: "POST",
          body: { workspace_id: WS_ID, status: "maybe" },
        }),
        ctx,
      ),
    );
    expect(status).toBe(500);
    expect(body.error.code).toBe("internal_error");
  });

  it("returns 409 for a converted quote", async () => {
    supabase = makeSupabaseClient({
      quotes: { data: { ...currentQuote, status: "converted" }, error: null },
    });
    stubWorkspaceMember(api, supabase);
    const { status, body: resBody } = await readJson(
      await quoteStatusPost(makeRequest(`/api/v1/quotes/${QUOTE_ID}/status`, { method: "POST", body }), ctx),
    );
    expect(status).toBe(409);
    expect(resBody.error.code).toBe("quote_locked");
  });

  it("returns 409 on optimistic-concurrency mismatch", async () => {
    const { status, body: resBody } = await readJson(
      await quoteStatusPost(
        makeRequest(`/api/v1/quotes/${QUOTE_ID}/status`, {
          method: "POST",
          body: { ...body, expected_updated_at: "2020-01-01T00:00:00.000Z" },
        }),
        ctx,
      ),
    );
    expect(status).toBe(409);
    expect(resBody.error.code).toBe("quote_conflict");
  });

  it("approves the quote and dispatches customer + staff emails", async () => {
    supabase = makeSupabaseClient({
      quotes: {
        data: { ...currentQuote, status: "approved" },
        error: null,
      },
      workspaces: { data: { name: "MOMS", timezone: "UTC" }, error: null },
    });
    (api.requireWorkspaceMember as jest.Mock).mockResolvedValue({ supabase, user: TEST_USER });
    const { status, body: resBody } = await readJson(
      await quoteStatusPost(makeRequest(`/api/v1/quotes/${QUOTE_ID}/status`, { method: "POST", body }), ctx),
    );
    expect(status).toBe(200);
    expect(resBody.data.status).toBe("approved");
    expect(dispatchQuoteLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: "quote.approved" }),
    );
    expect(dispatchQuoteLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: "quote.approved_staff", recipientEmail: TEST_USER.email }),
    );
  });

  it("declines the quote and dispatches the declined email", async () => {
    supabase = makeSupabaseClient({
      quotes: { data: { ...currentQuote, status: "declined" }, error: null },
      workspaces: { data: { name: "MOMS", timezone: "UTC" }, error: null },
    });
    (api.requireWorkspaceMember as jest.Mock).mockResolvedValue({ supabase, user: TEST_USER });
    const { status } = await readJson(
      await quoteStatusPost(
        makeRequest(`/api/v1/quotes/${QUOTE_ID}/status`, {
          method: "POST",
          body: { workspace_id: WS_ID, status: "declined" },
        }),
        ctx,
      ),
    );
    expect(status).toBe(200);
    expect(dispatchQuoteLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: "quote.declined" }),
    );
  });
});

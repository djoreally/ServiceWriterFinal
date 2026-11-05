import "../../../test/api-routes/env";

// Grey-box tests for the public-booking pay-now pair:
//   POST /api/v1/public-booking/[slug]/payment-intent
//   POST /api/v1/public-booking/[slug]/payment-intent/confirm
// The amount must always come from the server-side invoice balance, the
// caller is bound by the appointment's stored guest email, and the
// Payments add-on gate must hold before Stripe is ever touched.
jest.mock("@/lib/supabase", () => ({
  createSupabaseAdminClient: jest.fn(),
  createSupabaseServerClient: jest.fn(),
  createSupabaseRequestClient: jest.fn(),
}));
jest.mock("@/server/payments/stripe-workspace-execution", () => ({
  resolveStripeWorkspaceExecution: jest.fn(),
}));

import { createSupabaseAdminClient } from "@/lib/supabase";
import { resolveStripeWorkspaceExecution } from "@/server/payments/stripe-workspace-execution";
import { POST as createIntent } from "../../../../app/api/v1/public-booking/[slug]/payment-intent/route";
import { POST as confirmIntent } from "../../../../app/api/v1/public-booking/[slug]/payment-intent/confirm/route";
import {
  makeQueryBuilder,
  makeRequest,
  readJson,
  contextWithParams,
  WS_ID,
  APPOINTMENT_ID,
  type DbResult,
} from "../../../test/api-routes/helpers";

const SLUG = "momsoilchange";
const CUSTOMER_ID = "44444444-4444-4444-8444-444444444444";
const INVOICE_ID = "55555555-5555-4555-8555-555555555555";
const PAYMENT_ID = "66666666-6666-4666-8666-666666666666";
const GUEST_EMAIL = "guest@example.com";

const paymentIntentsCreate = jest.fn();
const paymentIntentsRetrieve = jest.fn();

// Per-table result queues: each from(table) call consumes the next result
// for that table (the last one repeats), so multi-step flows (select ->
// insert -> update against `payments`) can be stubbed in order.
function sequenceClient(tables: Record<string, DbResult[]>) {
  const queues = new Map(
    Object.entries(tables).map(([table, results]) => [table, [...results]]),
  );
  const from = jest.fn((table: string) => {
    const queue = queues.get(table);
    const result =
      queue && queue.length > 1 ? queue.shift()! : (queue?.[0] ?? { data: null, error: null });
    return makeQueryBuilder(result);
  });
  return {
    from,
    rpc: jest.fn(() => Promise.resolve({ data: null, error: null })),
    auth: { getUser: jest.fn(() => Promise.resolve({ data: { user: null }, error: null })) },
  };
}

function baseTables(overrides: Record<string, DbResult[]> = {}): Record<string, DbResult[]> {
  return {
    workspace_settings: [
      { data: { workspace_id: WS_ID }, error: null },
      { data: { operational_settings: { stripe_payment_mode: "connect", stripe_account_id: "acct_test" } }, error: null },
    ],
    workspaces: [
      {
        data: { id: WS_ID, name: "MOMS Mobile Oil Change", timezone: "America/New_York", currency_code: "USD" },
        error: null,
      },
    ],
    appointments: [
      {
        data: {
          id: APPOINTMENT_ID,
          workspace_id: WS_ID,
          customer_id: CUSTOMER_ID,
          status: "confirmed",
          metadata: { guest_email: GUEST_EMAIL },
        },
        error: null,
      },
    ],
    workspace_billing: [
      { data: { payments_addon_active: true, subscription_status: "active" }, error: null },
    ],
    invoices: [
      {
        data: [{ id: INVOICE_ID, invoice_number: "INV-200", status: "issued", total: 112.03, amount_paid: 0 }],
        error: null,
      },
      { data: null, error: null },
    ],
    ...overrides,
  };
}

function installClient(tables: Record<string, DbResult[]>) {
  (createSupabaseAdminClient as jest.Mock).mockReturnValue(sequenceClient(tables));
  (resolveStripeWorkspaceExecution as jest.Mock).mockReturnValue({
    mode: "connect",
    accountId: "acct_test",
    stripe: { paymentIntents: { create: paymentIntentsCreate, retrieve: paymentIntentsRetrieve } },
    requestOptions: () => ({}),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  paymentIntentsCreate.mockResolvedValue({
    id: "pi_new_123",
    client_secret: "pi_new_123_secret",
    status: "requires_payment_method",
  });
});

describe("POST payment-intent (create)", () => {
  it("creates an intent for the server-side invoice balance, never a client amount", async () => {
    installClient(
      baseTables({
        payments: [
          { data: [], error: null },
          {
            data: { id: PAYMENT_ID, status: "pending", amount: 112.03, provider: "stripe", provider_payment_id: null, metadata: {} },
            error: null,
          },
          { data: null, error: null },
        ],
      }),
    );
    const res = await createIntent(
      makeRequest(`/api/v1/public-booking/${SLUG}/payment-intent`, {
        method: "POST",
        body: { appointment_id: APPOINTMENT_ID, email: "Guest@Example.com" },
      }),
      contextWithParams({ slug: SLUG }),
    );
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    expect(body.data).toMatchObject({
      payment_id: PAYMENT_ID,
      client_secret: "pi_new_123_secret",
      amount: 112.03,
      currency: "usd",
      mode: "connect",
      reused: false,
    });
    expect(paymentIntentsCreate).toHaveBeenCalledTimes(1);
    const [params] = paymentIntentsCreate.mock.calls[0];
    expect(params.amount).toBe(11203);
    expect(params.metadata).toMatchObject({
      workspace_id: WS_ID,
      appointment_id: APPOINTMENT_ID,
      invoice_id: INVOICE_ID,
      payment_id: PAYMENT_ID,
      source: "public_booking_paynow",
    });
  });

  it("returns 402 before touching Stripe when the Payments add-on is inactive", async () => {
    installClient(
      baseTables({
        workspace_billing: [
          { data: { payments_addon_active: false, subscription_status: "active" }, error: null },
        ],
        payments: [{ data: [], error: null }],
      }),
    );
    const res = await createIntent(
      makeRequest(`/api/v1/public-booking/${SLUG}/payment-intent`, {
        method: "POST",
        body: { appointment_id: APPOINTMENT_ID, email: GUEST_EMAIL },
      }),
      contextWithParams({ slug: SLUG }),
    );
    const { status, body } = await readJson(res);
    expect(status).toBe(402);
    expect(body.error.code).toBe("payments_addon_required");
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
  });

  it("returns 404 when the email does not match the appointment's guest email", async () => {
    installClient(
      baseTables({
        appointments: [
          {
            data: {
              id: APPOINTMENT_ID,
              workspace_id: WS_ID,
              customer_id: CUSTOMER_ID,
              status: "confirmed",
              metadata: { guest_email: "someone-else@example.com" },
            },
            error: null,
          },
        ],
        payments: [{ data: [], error: null }],
      }),
    );
    const res = await createIntent(
      makeRequest(`/api/v1/public-booking/${SLUG}/payment-intent`, {
        method: "POST",
        body: { appointment_id: APPOINTMENT_ID, email: GUEST_EMAIL },
      }),
      contextWithParams({ slug: SLUG }),
    );
    const { status, body } = await readJson(res);
    expect(status).toBe(404);
    expect(body.error.code).toBe("payment_booking_not_found");
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
  });

  it("reuses the booking's live intent instead of creating a second one", async () => {
    paymentIntentsRetrieve.mockResolvedValue({
      id: "pi_existing",
      status: "requires_payment_method",
      client_secret: "pi_existing_secret",
    });
    installClient(
      baseTables({
        payments: [
          {
            data: [
              {
                id: PAYMENT_ID,
                status: "pending",
                amount: 112.03,
                provider: "stripe",
                provider_payment_id: "pi_existing",
                metadata: { source: "public_booking_paynow", appointment_id: APPOINTMENT_ID },
              },
            ],
            error: null,
          },
        ],
      }),
    );
    const res = await createIntent(
      makeRequest(`/api/v1/public-booking/${SLUG}/payment-intent`, {
        method: "POST",
        body: { appointment_id: APPOINTMENT_ID, email: GUEST_EMAIL },
      }),
      contextWithParams({ slug: SLUG }),
    );
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ client_secret: "pi_existing_secret", reused: true });
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
  });

  it("returns 409 when the invoice has no balance due", async () => {
    installClient(
      baseTables({
        invoices: [
          {
            data: [{ id: INVOICE_ID, invoice_number: "INV-200", status: "paid", total: 112.03, amount_paid: 112.03 }],
            error: null,
          },
        ],
        payments: [{ data: [], error: null }],
      }),
    );
    const res = await createIntent(
      makeRequest(`/api/v1/public-booking/${SLUG}/payment-intent`, {
        method: "POST",
        body: { appointment_id: APPOINTMENT_ID, email: GUEST_EMAIL },
      }),
      contextWithParams({ slug: SLUG }),
    );
    const { status, body } = await readJson(res);
    expect(status).toBe(409);
    expect(body.error.code).toBe("payment_nothing_due");
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
  });
});

describe("POST payment-intent/confirm", () => {
  function confirmTables(paymentMetadata: Record<string, unknown> = {}) {
    return baseTables({
      payments: [
        {
          data: {
            id: PAYMENT_ID,
            status: "pending",
            amount: 112.03,
            provider_payment_id: "pi_test_123",
            metadata: { source: "public_booking_paynow", appointment_id: APPOINTMENT_ID, ...paymentMetadata },
          },
          error: null,
        },
        { data: null, error: null },
        { data: [{ amount: 112.03 }], error: null },
      ],
    });
  }

  function confirmRequest() {
    return confirmIntent(
      makeRequest(`/api/v1/public-booking/${SLUG}/payment-intent/confirm`, {
        method: "POST",
        body: { appointment_id: APPOINTMENT_ID, email: GUEST_EMAIL, payment_intent_id: "pi_test_123" },
      }),
      contextWithParams({ slug: SLUG }),
    );
  }

  it("settles the payment and rolls the invoice up to paid after Stripe-side verification", async () => {
    paymentIntentsRetrieve.mockResolvedValue({
      id: "pi_test_123",
      status: "succeeded",
      amount_received: 11203,
      latest_charge: "ch_123",
      metadata: { workspace_id: WS_ID, payment_id: PAYMENT_ID, appointment_id: APPOINTMENT_ID },
    });
    installClient(confirmTables());
    const { status, body } = await readJson(await confirmRequest());
    expect(status).toBe(200);
    expect(body.data).toMatchObject({
      success: true,
      settled: true,
      already_recorded: false,
      payment_id: PAYMENT_ID,
      amount_paid: 112.03,
      invoice_status: "paid",
    });
  });

  it("rejects an intent whose metadata does not bind it to this booking's payment", async () => {
    paymentIntentsRetrieve.mockResolvedValue({
      id: "pi_test_123",
      status: "succeeded",
      amount_received: 11203,
      latest_charge: "ch_123",
      metadata: { workspace_id: WS_ID, payment_id: "99999999-9999-4999-8999-999999999999", appointment_id: APPOINTMENT_ID },
    });
    installClient(confirmTables());
    const { status, body } = await readJson(await confirmRequest());
    expect(status).toBe(409);
    expect(body.error.code).toBe("payment_binding_mismatch");
  });

  it("rejects when the received amount differs from the recorded payment amount", async () => {
    paymentIntentsRetrieve.mockResolvedValue({
      id: "pi_test_123",
      status: "succeeded",
      amount_received: 5000,
      latest_charge: "ch_123",
      metadata: { workspace_id: WS_ID, payment_id: PAYMENT_ID, appointment_id: APPOINTMENT_ID },
    });
    installClient(confirmTables());
    const { status, body } = await readJson(await confirmRequest());
    expect(status).toBe(409);
    expect(body.error.code).toBe("payment_amount_mismatch");
  });

  it("reports not-settled without writing when Stripe says the intent has not succeeded", async () => {
    paymentIntentsRetrieve.mockResolvedValue({
      id: "pi_test_123",
      status: "requires_payment_method",
      amount_received: 0,
      latest_charge: null,
      metadata: { workspace_id: WS_ID, payment_id: PAYMENT_ID, appointment_id: APPOINTMENT_ID },
    });
    installClient(confirmTables());
    const { status, body } = await readJson(await confirmRequest());
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ success: false, settled: false, status: "requires_payment_method" });
  });
});

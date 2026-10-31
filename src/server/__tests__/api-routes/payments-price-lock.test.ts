import "../../../test/api-routes/env";

// Grey-box tests for the website-quote lock on POST /v1/payments (Next
// implementation). The Hono implementation shares the same validation
// helper (@/server/payments/locked-quote) and is covered in
// src/server/hono/__tests__/billing-price-lock.test.ts.
jest.mock("@/server/api", () => ({
  ...jest.requireActual("@/server/api"),
  requireWorkspaceMember: jest.fn(),
  requireUser: jest.fn(),
  requireCrmCapability: jest.fn(),
  requireWorkspacePaymentsAddon: jest.fn(),
}));
jest.mock("@/server/messaging/quote-payment-events", () => ({
  dispatchPaymentLifecycle: jest.fn().mockResolvedValue(undefined),
  LIFECYCLE_EVENT_KEYS: {
    paymentReceipt: "invoice_and_payment_sequence.payment_receipt",
    paymentFailed: "invoice_and_payment_sequence.payment_failed",
  },
}));

import * as api from "@/server/api";
import { POST as paymentsPost } from "../../../../app/api/v1/payments/route";
import {
  makeRequest,
  readJson,
  makeQueryBuilder,
  makeSupabaseClient,
  WS_ID,
  APPOINTMENT_ID,
  TEST_USER,
  type MockSupabaseClient,
} from "../../../test/api-routes/helpers";

const CREATED_PAYMENT_ID = "99999999-9999-4999-8999-999999999999";

const LOCKED_METADATA = {
  pricing_state: "website_quote_locked",
  estimated_cost: 122.57,
  client_estimated_cost: 122.57,
  tax_amount: 0,
  website_booking_id: "e38138f6-de07-4d75-8942-f4ce3d891fc7",
};

// Per-table result queues: each from(table) call shifts the next result, so
// the validator's reads (appointments, invoices), the pending-duplicate
// read and the insert on `payments` can each return a different shape.
function sequencedSupabase(queues: Record<string, Array<{ data: unknown; error: unknown }>>) {
  const client = makeSupabaseClient();
  const baseImpl = (client.from as jest.Mock).getMockImplementation() as (table: string) => unknown;
  (client.from as jest.Mock).mockImplementation((table: string) => {
    const queue = queues[table];
    if (queue && queue.length) {
      const result = queue.shift() as { data: unknown; error: unknown };
      return makeQueryBuilder({ data: result.data, error: result.error });
    }
    return baseImpl(table);
  });
  return client;
}

function stubAddon(supabase: MockSupabaseClient) {
  (api.requireWorkspacePaymentsAddon as jest.Mock).mockResolvedValue({
    supabase,
    user: TEST_USER,
  });
}

function lockedSupabase(paymentsQueue: Array<{ data: unknown; error: unknown }>, amountPaid = 30) {
  return sequencedSupabase({
    appointments: [
      { data: { source: "moms_website", metadata: { ...LOCKED_METADATA } }, error: null },
    ],
    invoices: [{ data: [{ amount_paid: amountPaid }], error: null }],
    payments: paymentsQueue,
  });
}

const createdPayment = {
  data: { id: CREATED_PAYMENT_ID, customer_id: null, status: "pending", metadata: {} },
  error: null,
};
const noDuplicate = { data: null, error: null };

function postBody(amount: number) {
  return {
    workspace_id: WS_ID,
    amount,
    status: "pending",
    metadata: { appointment_id: APPOINTMENT_ID, payment_type: "pay_at_service" },
  };
}

describe("POST /v1/payments — website quote lock (Next)", () => {
  it("rejects a fee-inflated amount for a locked appointment, naming the expected amount", async () => {
    const supabase = lockedSupabase([noDuplicate]);
    stubAddon(supabase);
    // $130.37 is the $122.57 quote with the $4 waste fee + 3% surcharge
    // pattern applied — the exact closeout inflation being closed.
    const { status, body } = await readJson(
      await paymentsPost(makeRequest("/api/v1/payments", { method: "POST", body: postBody(130.37) })),
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe("price_lock_amount_mismatch");
    expect(body.error.expected_amount).toBe(92.57);
    expect(body.error.message).toContain("$92.57");
    // No payment was inserted: the payments queue still holds nothing and
    // the single queued duplicate read was the only payments access needed
    // before rejection (an insert would have consumed/returned a row).
    expect(body.data).toBeUndefined();
  });

  it("accepts exactly the remaining locked balance (quote − amount_paid)", async () => {
    const supabase = lockedSupabase([noDuplicate, createdPayment]);
    stubAddon(supabase);
    const { status, body } = await readJson(
      await paymentsPost(makeRequest("/api/v1/payments", { method: "POST", body: postBody(92.57) })),
    );
    expect(status).toBe(201);
    expect(body.data.id).toBe(CREATED_PAYMENT_ID);
  });

  it("accepts the full quote when no invoice amount has been paid yet", async () => {
    const supabase = sequencedSupabase({
      appointments: [
        { data: { source: "moms_website", metadata: { ...LOCKED_METADATA } }, error: null },
      ],
      invoices: [{ data: [], error: null }],
      payments: [noDuplicate, createdPayment],
    });
    stubAddon(supabase);
    const { status, body } = await readJson(
      await paymentsPost(makeRequest("/api/v1/payments", { method: "POST", body: postBody(122.57) })),
    );
    expect(status).toBe(201);
    expect(body.data.id).toBe(CREATED_PAYMENT_ID);
  });

  it("reuses an existing pending payment that is already at the correct locked amount", async () => {
    const duplicate = {
      data: { id: "dup-1", amount: 92.57, status: "pending", metadata: {} },
      error: null,
    };
    const supabase = lockedSupabase([duplicate]);
    stubAddon(supabase);
    const { status, body } = await readJson(
      await paymentsPost(makeRequest("/api/v1/payments", { method: "POST", body: postBody(92.57) })),
    );
    expect(status).toBe(200);
    expect(body.reused).toBe(true);
    expect(body.data.id).toBe("dup-1");
  });

  it("keeps reuse working when the closeout RPC already created the correct pending payment", async () => {
    const duplicate = {
      data: { id: "dup-1", amount: 92.57, status: "pending", metadata: {} },
      error: null,
    };
    const supabase = lockedSupabase([duplicate]);
    stubAddon(supabase);
    // Even if a stale client posts the inflated amount, the correct pending
    // payment on file is what gets reused — no new inflated record exists.
    const { status, body } = await readJson(
      await paymentsPost(makeRequest("/api/v1/payments", { method: "POST", body: postBody(130.37) })),
    );
    expect(status).toBe(200);
    expect(body.reused).toBe(true);
    expect(body.data.amount).toBe(92.57);
  });

  it("rejects when the existing pending payment is itself at the wrong amount", async () => {
    const duplicate = {
      data: { id: "dup-bad", amount: 130.37, status: "pending", metadata: {} },
      error: null,
    };
    const supabase = lockedSupabase([duplicate]);
    stubAddon(supabase);
    const { status, body } = await readJson(
      await paymentsPost(makeRequest("/api/v1/payments", { method: "POST", body: postBody(92.57) })),
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe("price_lock_amount_mismatch");
    expect(body.error.expected_amount).toBe(92.57);
  });

  it("rejects any positive amount once the locked quote is fully paid", async () => {
    const supabase = lockedSupabase([noDuplicate], 122.57);
    stubAddon(supabase);
    const { status, body } = await readJson(
      await paymentsPost(makeRequest("/api/v1/payments", { method: "POST", body: postBody(122.57) })),
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe("price_lock_amount_mismatch");
    expect(body.error.expected_amount).toBe(0);
    expect(body.error.message).toContain("$0.00");
  });

  it("leaves native appointment payments unchanged (no lock validation)", async () => {
    const supabase = sequencedSupabase({
      appointments: [{ data: { source: "staff", metadata: { estimated_cost: 100 } }, error: null }],
      payments: [noDuplicate, createdPayment],
    });
    stubAddon(supabase);
    // A fee-loaded native amount that would be rejected for a locked
    // appointment is accepted untouched for a native one.
    const { status, body } = await readJson(
      await paymentsPost(makeRequest("/api/v1/payments", { method: "POST", body: postBody(144.41) })),
    );
    expect(status).toBe(201);
    expect(body.data.id).toBe(CREATED_PAYMENT_ID);
  });
});

describe("POST /v1/payments — booking-link client quote lock (Next)", () => {
  const CLIENT_LOCKED_METADATA = {
    pricing_state: "client_quote_locked",
    estimated_cost: 137,
    client_estimated_cost: 137,
    tax_amount: 0,
  };

  function clientLockedSupabase(paymentsQueue: Array<{ data: unknown; error: unknown }>, amountPaid = 0) {
    return sequencedSupabase({
      appointments: [
        { data: { source: "public_booking", metadata: { ...CLIENT_LOCKED_METADATA } }, error: null },
      ],
      invoices: [{ data: [{ amount_paid: amountPaid }], error: null }],
      payments: paymentsQueue,
    });
  }

  it("rejects the quote plus a recomputed waste fee, naming the booking-link quote", async () => {
    const supabase = clientLockedSupabase([noDuplicate]);
    stubAddon(supabase);
    // $141.00 is the $137.00 link quote with the $4 waste fee added on top —
    // the double-count the client quote lock exists to prevent.
    const { status, body } = await readJson(
      await paymentsPost(makeRequest("/api/v1/payments", { method: "POST", body: postBody(141) })),
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe("price_lock_amount_mismatch");
    expect(body.error.expected_amount).toBe(137);
    expect(body.error.message).toContain("booking-link quote");
    expect(body.error.message).toContain("$137.00");
    expect(body.data).toBeUndefined();
  });

  it("accepts exactly the locked link quote when nothing has been paid", async () => {
    const supabase = clientLockedSupabase([noDuplicate, createdPayment]);
    stubAddon(supabase);
    const { status, body } = await readJson(
      await paymentsPost(makeRequest("/api/v1/payments", { method: "POST", body: postBody(137) })),
    );
    expect(status).toBe(201);
    expect(body.data.id).toBe(CREATED_PAYMENT_ID);
  });

  it("accepts only the remaining balance once part of the link quote is paid", async () => {
    const supabase = clientLockedSupabase([noDuplicate, createdPayment], 50);
    stubAddon(supabase);
    const { status, body } = await readJson(
      await paymentsPost(makeRequest("/api/v1/payments", { method: "POST", body: postBody(87) })),
    );
    expect(status).toBe(201);
    expect(body.data.id).toBe(CREATED_PAYMENT_ID);
  });
});

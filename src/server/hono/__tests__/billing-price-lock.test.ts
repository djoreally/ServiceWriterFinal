/**
 * Grey-box tests for the website-quote lock on POST /v1/payments (Hono
 * billing router). The Next implementation shares the same validation
 * helper (@/server/payments/locked-quote) and is covered in
 * src/server/__tests__/api-routes/payments-price-lock.test.ts.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { installWebGlobals as mockInstallWebGlobals } from "../test-support/webGlobals";
import { makeServerApiMock as mockMakeServerApiMock } from "../test-support/serverApiMock";
import {
  makeSupabaseLibMock as mockMakeSupabaseLibMock,
  quotePaymentEventsFactory as mockQuotePaymentEventsFactory,
  stripeInvoiceSyncFactory as mockStripeInvoiceSyncFactory,
  stripeWorkspaceExecutionFactory as mockStripeWorkspaceExecutionFactory,
  workspaceBillingFactory as mockWorkspaceBillingFactory,
} from "../test-support/moduleMocks";

jest.mock("next/server", () => {
  mockInstallWebGlobals();
  return jest.requireActual("next/server");
});
jest.mock("@/server/api", () =>
  mockMakeServerApiMock(jest.requireActual("@/server/api")),
);
jest.mock("@/lib/supabase", () =>
  mockMakeSupabaseLibMock(),
);
jest.mock("@/server/billing/workspace-billing", () =>
  mockWorkspaceBillingFactory(),
);
jest.mock("@/server/messaging/quote-payment-events", () =>
  mockQuotePaymentEventsFactory(),
);
jest.mock("@/server/payments/stripe-invoice-sync", () =>
  mockStripeInvoiceSyncFactory(),
);
jest.mock("@/server/payments/stripe-workspace-execution", () =>
  mockStripeWorkspaceExecutionFactory(),
);

import { billingRouter as billingRouterRaw } from "@/server/hono/routes/billing";
import { testRouter } from "../test-support/routerTest";
import { calls, db, resetHarness, WS_ID } from "../test-support/state";

const billingRouter = testRouter(billingRouterRaw);

const APPOINTMENT_ID = "33333333-3333-4333-8333-333333333333";

const LOCKED_METADATA = {
  pricing_state: "website_quote_locked",
  estimated_cost: 122.57,
  client_estimated_cost: 122.57,
  tax_amount: 0,
  website_booking_id: "e38138f6-de07-4d75-8942-f4ce3d891fc7",
};

beforeEach(() => {
  resetHarness();
});

function seedLocked(amountPaid = 30) {
  db["appointments:single"] = {
    data: { source: "moms_website", metadata: { ...LOCKED_METADATA } },
    error: null,
  };
  db["invoices"] = { data: [{ amount_paid: amountPaid }], error: null };
}

function postPayment(body: Record<string, unknown>) {
  return billingRouter.request("/v1/payments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      workspace_id: WS_ID,
      status: "pending",
      metadata: { appointment_id: APPOINTMENT_ID, payment_type: "pay_at_service" },
      ...body,
    }),
  });
}

describe("POST /v1/payments — website quote lock (Hono)", () => {
  it("rejects a fee-inflated amount for a locked appointment, naming the expected amount", async () => {
    seedLocked();
    db["payments:single"] = { data: null, error: null };
    const res = await postPayment({ amount: 130.37 });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("price_lock_amount_mismatch");
    expect(body.error.expected_amount).toBe(92.57);
    expect(body.error.message).toContain("$92.57");
    expect(calls.inserts.some((i) => i.table === "payments")).toBe(false);
  });

  it("accepts exactly the remaining locked balance (quote − amount_paid)", async () => {
    seedLocked();
    // Succeeded payments skip the pending-duplicate read, so the insert's
    // .single() result is the only payments:single consumer in this flow.
    db["payments:single"] = {
      data: { id: "pay-9", customer_id: null, status: "succeeded", metadata: {} },
      error: null,
    };
    const res = await postPayment({ amount: 92.57, status: "succeeded" });
    expect(res.status).toBe(201);
    expect((await res.json()).data.id).toBe("pay-9");
    expect(calls.inserts.some((i) => i.table === "payments")).toBe(true);
  });

  it("reuses an existing pending payment that is already at the correct locked amount", async () => {
    seedLocked();
    db["payments:single"] = {
      data: { id: "dup-1", amount: 92.57, status: "pending", metadata: {} },
      error: null,
    };
    const res = await postPayment({ amount: 92.57 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reused).toBe(true);
    expect(body.data.id).toBe("dup-1");
    expect(calls.inserts.some((i) => i.table === "payments")).toBe(false);
  });

  it("rejects when the existing pending payment is itself at the wrong amount", async () => {
    seedLocked();
    db["payments:single"] = {
      data: { id: "dup-bad", amount: 130.37, status: "pending", metadata: {} },
      error: null,
    };
    const res = await postPayment({ amount: 92.57 });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("price_lock_amount_mismatch");
    expect(calls.inserts.some((i) => i.table === "payments")).toBe(false);
  });

  it("leaves native appointment payments unchanged (no lock validation)", async () => {
    db["appointments:single"] = {
      data: { source: "staff", metadata: { estimated_cost: 100 } },
      error: null,
    };
    db["payments:single"] = {
      data: { id: "pay-9", customer_id: null, status: "succeeded", metadata: {} },
      error: null,
    };
    const res = await postPayment({ amount: 144.41, status: "succeeded" });
    expect(res.status).toBe(201);
    expect((await res.json()).data.id).toBe("pay-9");
  });
});

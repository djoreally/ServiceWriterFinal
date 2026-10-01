/**
 * Grey-box tests for the billing Hono router (payments, checkout, cash drawer).
 * Supabase, Stripe workspace helpers and lifecycle dispatch are mocked.
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
import {
  authState,
  calls,
  db,
  resetHarness,
  CUSTOMER_ID,
  WS_ID,
} from "../test-support/state";

const billingRouter = testRouter(billingRouterRaw);

const INVOICE_ID = "aa0e8400-e29b-41d4-a716-446655440001";

beforeEach(() => {
  resetHarness();
});

describe("billing router", () => {
  describe("GET /v1/payments", () => {
    it("lists payments for a workspace with the payments add-on", async () => {
      db.payments = { data: [{ id: "pay-1", amount: 100 }], error: null };
      const res = await billingRouter.request(
        `/v1/payments?workspace_id=${WS_ID}`,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.pagination).toEqual({ limit: 25, offset: 0 });
    });

    it("returns 402 when the payments add-on is not active", async () => {
      authState.mode = "payments_required";
      const res = await billingRouter.request(
        `/v1/payments?workspace_id=${WS_ID}`,
      );
      expect(res.status).toBe(402);
      expect((await res.json()).error.code).toBe("payments_addon_required");
    });

    it("returns 401 when unauthenticated", async () => {
      authState.mode = "unauthorized";
      const res = await billingRouter.request(
        `/v1/payments?workspace_id=${WS_ID}`,
      );
      expect(res.status).toBe(401);
    });

    it("rejects a malformed workspace_id", async () => {
      const res = await billingRouter.request(
        "/v1/payments?workspace_id=nope",
      );
      // zod uuid parse on the query param -> 500 via app onError
      expect(res.status).toBe(500);
    });
  });

  describe("POST /v1/payments", () => {
    const base = {
      workspace_id: WS_ID,
      invoice_id: INVOICE_ID,
      amount: 150.0,
      status: "pending",
    };

    it("creates a payment against an invoice and returns 201", async () => {
      db["invoices:single"] = {
        data: { id: INVOICE_ID, customer_id: CUSTOMER_ID, status: "issued" },
        error: null,
      };
      db["payments:single"] = {
        data: { id: "pay-9", status: "pending" },
        error: null,
      };
      const res = await billingRouter.request("/v1/payments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(base),
      });
      expect(res.status).toBe(201);
      expect((await res.json()).data.id).toBe("pay-9");
      expect(
        calls.inserts.some((i) => i.table === "payments"),
      ).toBe(true);
    });

    it("returns 422 when the payment has no provenance", async () => {
      const res = await billingRouter.request("/v1/payments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspace_id: WS_ID, amount: 10 }),
      });
      expect(res.status).toBe(422);
      expect((await res.json()).error.code).toBe("payment_provenance_required");
      expect(calls.inserts).toHaveLength(0);
    });

    it("returns 409 when posting to a void invoice", async () => {
      db["invoices:single"] = {
        data: { id: INVOICE_ID, customer_id: CUSTOMER_ID, status: "void" },
        error: null,
      };
      const res = await billingRouter.request("/v1/payments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(base),
      });
      expect(res.status).toBe(409);
      expect((await res.json()).error.code).toBe("invoice_void");
    });

    it("returns 402 when the payments add-on is not active", async () => {
      authState.mode = "payments_required";
      const res = await billingRouter.request("/v1/payments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(base),
      });
      expect(res.status).toBe(402);
    });
  });

  describe("route registration", () => {
    it("exposes the subscription endpoint", async () => {
      db["workspace_billing:single"] = { data: null, error: null };
      const res = await billingRouter.request(
        `/v1/billing/subscription?workspace_id=${WS_ID}`,
      );
      expect(res.status).not.toBe(404);
    });

    it("exposes the cash drawer endpoint", async () => {
      const res = await billingRouter.request(
        `/v1/billing/cash-drawer?workspace_id=${WS_ID}`,
      );
      expect(res.status).not.toBe(404);
    });

    it("returns 404 for unknown paths", async () => {
      const res = await billingRouter.request("/v1/billing/nope");
      expect(res.status).toBe(404);
    });
  });
});

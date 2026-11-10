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
      // zod uuid parse on the query param -> ZodError -> 400
      // invalid_input via errorResponse (never a 500).
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("invalid_input");
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

  describe("GET /v1/billing/cash-receipts", () => {
    const INV_A = "bb0e8400-e29b-41d4-a716-446655440001";
    const INV_B = "bb0e8400-e29b-41d4-a716-446655440002";
    const INV_C = "bb0e8400-e29b-41d4-a716-446655440003";
    const INV_D = "bb0e8400-e29b-41d4-a716-446655440004";
    const INV_E = "bb0e8400-e29b-41d4-a716-446655440005";
    const INV_F = "bb0e8400-e29b-41d4-a716-446655440006";
    const WO_B = "cc0e8400-e29b-41d4-a716-446655440002";
    const WO_E = "cc0e8400-e29b-41d4-a716-446655440005";
    const WO_F = "cc0e8400-e29b-41d4-a716-446655440006";
    const APPT_A = "dd0e8400-e29b-41d4-a716-446655440001";
    const APPT_B = "dd0e8400-e29b-41d4-a716-446655440002";
    const APPT_D = "dd0e8400-e29b-41d4-a716-446655440004";
    const APPT_E = "dd0e8400-e29b-41d4-a716-446655440005";
    const APPT_F_META = "dd0e8400-e29b-41d4-a716-446655440006";
    const APPT_F_WO = "dd0e8400-e29b-41d4-a716-446655440007";

    // Fixtures mirror PRODUCTION's proven shape (live census 2026-11-10),
    // not the repo's claimed one: of 191 paid invoices only 2 carry
    // work_order_id; the live invoice→appointment link is
    // invoices.metadata.appointment_id — the same key
    // sync_appointment_invoice_v1 uses to find an invoice. Angela
    // Tuckowski's INV-569 is the archetype: work_order_id NULL (her
    // service record's work_order_id is NULL too), metadata carries the
    // appointment_id.
    function seedCashReceipts() {
      db.workspace_members = {
        data: [{ workspace_id: WS_ID, is_active: true, workspaces: { is_active: true } }],
        error: null,
      };
      db.payments = {
        data: [
          // Prepayment: paid Oct 15, 2026 for a Nov 12, 2026 job.
          // Resolves through the work-order chain (hop 2): its invoice
          // has no metadata appointment link.
          {
            id: "pay-prepaid", amount: 90, status: "succeeded", provider: "stripe",
            paid_at: "2026-10-15T15:00:00.000Z", created_at: "2026-10-15T15:00:00.000Z",
            metadata: null, invoice_id: INV_B,
          },
          // Unlinked payment: no invoice, so its paid date rules.
          {
            id: "pay-unlinked", amount: 25, status: "succeeded", provider: "stripe",
            paid_at: "2026-11-05T15:00:00.000Z", created_at: "2026-11-05T15:00:00.000Z",
            metadata: null, invoice_id: null,
          },
          // Unresolvable: the invoice's metadata appointment_id is not
          // a uuid-shaped string and it carries no work order — the
          // paid date rules, and nothing throws.
          {
            id: "pay-broken", amount: 40, status: "succeeded", provider: "stripe",
            paid_at: "2026-11-06T15:00:00.000Z", created_at: "2026-11-06T15:00:00.000Z",
            metadata: null, invoice_id: INV_C,
          },
          // A waiver row on a November job: the server resolves and
          // returns it — the adjustment exclusion is the client
          // receipts mapping's job (PR #199), not this endpoint's.
          {
            id: "pay-waive", amount: 10.84, status: "succeeded", provider: null,
            paid_at: "2026-11-07T15:00:00.000Z", created_at: "2026-11-07T15:00:00.000Z",
            metadata: { source: "manual_adjustment", adjustment_type: "cash_discount_fee_waive" },
            invoice_id: INV_D,
          },
          // Both hops available, pointing at DIFFERENT appointments:
          // the metadata hop (Nov 2) must win over the work-order
          // chain (Nov 20).
          {
            id: "pay-both", amount: 60, status: "succeeded", provider: "stripe",
            paid_at: "2026-11-08T15:00:00.000Z", created_at: "2026-11-08T15:00:00.000Z",
            metadata: null, invoice_id: INV_F,
          },
          // Malformed metadata appointment_id ("INV-569" is an invoice
          // NUMBER, not a uuid): falls through to the work-order chain.
          {
            id: "pay-malformed", amount: 55, status: "succeeded", provider: "stripe",
            paid_at: "2026-11-09T10:00:00.000Z", created_at: "2026-11-09T10:00:00.000Z",
            metadata: null, invoice_id: INV_E,
          },
          // Back-dated closeout — ANGELA'S PRODUCTION SHAPE exactly:
          // paid Nov 9, 2026 for a Sep 24, 2025 job; the invoice's
          // work_order_id is NULL and metadata carries appointment_id.
          {
            id: "pay-backdated", amount: 110.23, status: "succeeded", provider: "other",
            paid_at: "2026-11-09T19:31:00.000Z", created_at: "2026-11-09T19:31:00.000Z",
            metadata: { payment_method: "cash" }, invoice_id: INV_A,
          },
        ],
        error: null,
      };
      db.invoices = {
        data: [
          { id: INV_A, work_order_id: null, metadata: { appointment_id: APPT_A } },
          { id: INV_B, work_order_id: WO_B, metadata: null },
          { id: INV_C, work_order_id: null, metadata: { appointment_id: 12345 } },
          { id: INV_D, work_order_id: null, metadata: { appointment_id: APPT_D } },
          { id: INV_E, work_order_id: WO_E, metadata: { appointment_id: "INV-569" } },
          { id: INV_F, work_order_id: WO_F, metadata: { appointment_id: APPT_F_META } },
        ],
        error: null,
      };
      db.work_orders = {
        data: [
          { id: WO_B, appointment_id: APPT_B },
          { id: WO_E, appointment_id: APPT_E },
          { id: WO_F, appointment_id: APPT_F_WO },
        ],
        error: null,
      };
      db.appointments = {
        data: [
          { id: APPT_A, starts_at: "2025-09-24T14:00:00.000Z" },
          { id: APPT_B, starts_at: "2026-11-12T15:00:00.000Z" },
          { id: APPT_D, starts_at: "2026-11-07T14:00:00.000Z" },
          { id: APPT_E, starts_at: "2026-11-03T14:00:00.000Z" },
          { id: APPT_F_META, starts_at: "2026-11-02T14:00:00.000Z" },
          { id: APPT_F_WO, starts_at: "2026-11-20T14:00:00.000Z" },
        ],
        error: null,
      };
    }

    it("windows on the effective (job) date in both directions", async () => {
      seedCashReceipts();
      const res = await billingRouter.request(
        "/v1/billing/cash-receipts?from=2026-11-01T00:00:00.000Z&to=2026-11-30T23:59:59.000Z",
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      // Paid in November but jobbed in Sep 2025: out (the back-dated
      // closeout). Paid in October but jobbed in November: in. Rows
      // resolving to a November job date are in whichever hop found
      // them; paid-date rows with no resolved job date stay on their
      // paid date.
      expect(body.data.map((row: { id: string }) => row.id)).toEqual([
        "pay-prepaid",
        "pay-unlinked",
        "pay-broken",
        "pay-waive",
        "pay-both",
        "pay-malformed",
      ]);
    });

    it("resolves appointment_starts_at through the invoice chain, null when it cannot", async () => {
      seedCashReceipts();
      const res = await billingRouter.request(
        "/v1/billing/cash-receipts?from=2025-01-01T00:00:00.000Z",
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      const byId = new Map<string, { appointment_starts_at: string | null }>(
        body.data.map((row: { id: string; appointment_starts_at: string | null }) => [row.id, row]),
      );
      // Angela's shape: metadata hop, work_order_id NULL.
      expect(byId.get("pay-backdated")?.appointment_starts_at).toBe("2025-09-24T14:00:00.000Z");
      // Work-order chain (hop 2) still resolves when it is the only link.
      expect(byId.get("pay-prepaid")?.appointment_starts_at).toBe("2026-11-12T15:00:00.000Z");
      expect(byId.get("pay-unlinked")?.appointment_starts_at).toBeNull();
      expect(byId.get("pay-broken")?.appointment_starts_at).toBeNull();
      // The waiver row is resolved and returned by the server; the
      // client mapping excludes it from collected figures.
      expect(byId.get("pay-waive")?.appointment_starts_at).toBe("2026-11-07T14:00:00.000Z");
    });

    it("prefers the metadata hop, and a malformed metadata id falls through to the work-order chain", async () => {
      seedCashReceipts();
      const res = await billingRouter.request(
        "/v1/billing/cash-receipts?from=2025-01-01T00:00:00.000Z",
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      const byId = new Map<string, { appointment_starts_at: string | null }>(
        body.data.map((row: { id: string; appointment_starts_at: string | null }) => [row.id, row]),
      );
      // INV_F points at Nov 2 via metadata and Nov 20 via its work
      // order: the metadata hop wins.
      expect(byId.get("pay-both")?.appointment_starts_at).toBe("2026-11-02T14:00:00.000Z");
      // INV_E's metadata appointment_id is "INV-569" — not a uuid — so
      // hop 2 resolves Nov 3 instead, without throwing.
      expect(byId.get("pay-malformed")?.appointment_starts_at).toBe("2026-11-03T14:00:00.000Z");
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

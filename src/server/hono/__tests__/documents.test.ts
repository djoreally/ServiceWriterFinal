/**
 * Grey-box tests for the documents Hono router (invoices, quotes, declined services).
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { installWebGlobals as mockInstallWebGlobals } from "../test-support/webGlobals";
import { makeServerApiMock as mockMakeServerApiMock } from "../test-support/serverApiMock";
import {
  invoiceEventsFactory as mockInvoiceEventsFactory,
  lifecycleEventsFactory as mockLifecycleEventsFactory,
  lifecycleSenderFactory as mockLifecycleSenderFactory,
  makeSupabaseLibMock as mockMakeSupabaseLibMock,
  quotePaymentEventsFactory as mockQuotePaymentEventsFactory,
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
jest.mock("@/server/messaging/invoice-events", () =>
  mockInvoiceEventsFactory(),
);
jest.mock("@/server/messaging/lifecycle-events", () =>
  mockLifecycleEventsFactory(),
);
jest.mock("@/server/messaging/lifecycle-sender", () =>
  mockLifecycleSenderFactory(),
);
jest.mock("@/server/messaging/quote-payment-events", () =>
  mockQuotePaymentEventsFactory(),
);

import { documentsRouter as documentsRouterRaw } from "@/server/hono/routes/documents";
import { testRouter } from "../test-support/routerTest";
import {
  authState,
  calls,
  db,
  resetHarness,
  CUSTOMER_ID,
  WS_ID,
} from "../test-support/state";

const documentsRouter = testRouter(documentsRouterRaw);

const INVOICE_ID = "aa0e8400-e29b-41d4-a716-446655440001";
const QUOTE_ID = "bb0e8400-e29b-41d4-a716-446655440002";

beforeEach(() => {
  resetHarness();
});

describe("documents router", () => {
  describe("GET /v1/invoices", () => {
    it("lists invoices with pagination", async () => {
      db.invoices = { data: [{ id: INVOICE_ID, total: 200 }], error: null };
      const res = await documentsRouter.request(
        `/v1/invoices?workspace_id=${WS_ID}`,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.pagination.limit).toBeGreaterThan(0);
    });

    it("returns 401 when unauthenticated", async () => {
      authState.mode = "unauthorized";
      const res = await documentsRouter.request(
        `/v1/invoices?workspace_id=${WS_ID}`,
      );
      expect(res.status).toBe(401);
    });

    it("rejects a malformed workspace_id", async () => {
      const res = await documentsRouter.request(
        "/v1/invoices?workspace_id=nope",
      );
      expect(res.status).toBe(500);
    });
  });

  describe("POST /v1/invoices", () => {
    const body = {
      workspace_id: WS_ID,
      customer_id: CUSTOMER_ID,
      status: "draft",
      subtotal: 100,
      tax_amount: 8,
      total: 108,
      line_items: [
        { description: "Oil change", quantity: 1, unit_price: 100 },
      ],
    };

    it("creates an invoice via the create_invoice_v1 rpc and returns 201", async () => {
      db["rpc:create_invoice_v1"] = { data: INVOICE_ID, error: null };
      db["invoices:single"] = {
        data: { id: INVOICE_ID, status: "draft", total: 108 },
        error: null,
      };
      const res = await documentsRouter.request("/v1/invoices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(201);
      expect((await res.json()).data.id).toBe(INVOICE_ID);
      expect(calls.rpc.some((r) => r.fn === "create_invoice_v1")).toBe(true);
    });

    it("propagates rpc failures through the error contract", async () => {
      db["rpc:create_invoice_v1"] = {
        data: null,
        error: Object.assign(new Error("rpc blew up"), {
          code: "XX000",
          status: 500,
        }),
      };
      const res = await documentsRouter.request("/v1/invoices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(500);
      expect((await res.json()).error.code).toBe("XX000");
    });

    it("rejects a negative subtotal", async () => {
      const res = await documentsRouter.request("/v1/invoices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, subtotal: -5 }),
      });
      expect(res.status).toBe(500);
      expect(calls.rpc).toHaveLength(0);
    });

    it("enforces staff roles", async () => {
      authState.role = "technician";
      const res = await documentsRouter.request("/v1/invoices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(403);
    });
  });

  describe("GET /v1/invoices/:id", () => {
    it("returns the invoice", async () => {
      db["invoices:single"] = {
        data: { id: INVOICE_ID, status: "issued" },
        error: null,
      };
      const res = await documentsRouter.request(
        `/v1/invoices/${INVOICE_ID}?workspace_id=${WS_ID}`,
      );
      expect(res.status).toBe(200);
      expect((await res.json()).data.id).toBe(INVOICE_ID);
    });
  });

  describe("DELETE /v1/invoices/:id", () => {
    it("voids the invoice", async () => {
      db["invoices:single"] = {
        data: { id: INVOICE_ID, status: "void" },
        error: null,
      };
      const res = await documentsRouter.request(
        `/v1/invoices/${INVOICE_ID}?workspace_id=${WS_ID}`,
        { method: "DELETE" },
      );
      expect(res.status).toBe(200);
      expect(calls.updates.some((u) => u.table === "invoices")).toBe(true);
    });

    it("restricts voiding to owner/admin/manager", async () => {
      authState.role = "receptionist";
      const res = await documentsRouter.request(
        `/v1/invoices/${INVOICE_ID}?workspace_id=${WS_ID}`,
        { method: "DELETE" },
      );
      expect(res.status).toBe(403);
    });
  });

  describe("POST /v1/quotes/:id/status", () => {
    it("transitions a quote and returns the updated row", async () => {
      db["quotes:single"] = {
        data: { id: QUOTE_ID, status: "accepted", updated_at: "t1" },
        error: null,
      };
      const res = await documentsRouter.request(
        `/v1/quotes/${QUOTE_ID}/status`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspace_id: WS_ID, status: "approved" }),
        },
      );
      expect(res.status).toBe(200);
      expect(calls.updates.some((u) => u.table === "quotes")).toBe(true);
    });

    it("returns 409 for a converted (locked) quote", async () => {
      db["quotes:single"] = {
        data: { id: QUOTE_ID, status: "converted" },
        error: null,
      };
      const res = await documentsRouter.request(
        `/v1/quotes/${QUOTE_ID}/status`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspace_id: WS_ID, status: "approved" }),
        },
      );
      expect(res.status).toBe(409);
      expect((await res.json()).error.code).toBe("quote_locked");
      expect(calls.updates).toHaveLength(0);
    });
  });

  describe("route registration", () => {
    it("exposes the declined-services tracker", async () => {
      const res = await documentsRouter.request(
        `/v1/declined-services?workspace_id=${WS_ID}`,
      );
      expect(res.status).not.toBe(404);
    });

    it("exposes the quote line items endpoints", async () => {
      const res = await documentsRouter.request(
        `/v1/quotes/${QUOTE_ID}/items?workspace_id=${WS_ID}`,
      );
      expect(res.status).not.toBe(404);
    });

    it("returns 404 for unknown paths", async () => {
      const res = await documentsRouter.request("/v1/invoices-zzz");
      expect(res.status).toBe(404);
    });
  });
});

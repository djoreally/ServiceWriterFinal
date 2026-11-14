/**
 * Grey-box tests for POST /v1/billing/receipt-ocr — the Scan Receipt
 * door. It used to proxy to an `expense-receipt-ocr` edge function
 * that exists nowhere in the repo (every scan failed with "The
 * payment service request failed."); it now reads in-process and
 * answers the OcrResult shape at top level, as the old proxy did.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
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
import { db, resetHarness } from "../test-support/state";

const billingRouter = testRouter(billingRouterRaw);

const realFetch = globalThis.fetch;

function stubProviderFetch(payload: unknown) {
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(payload) } }],
    }),
  })) as unknown as typeof fetch;
}

beforeEach(() => {
  resetHarness();
  process.env.RECEIPT_PARSE_AI_API_KEY = "test-key";
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.RECEIPT_PARSE_AI_API_KEY;
});

describe("POST /v1/billing/receipt-ocr", () => {
  it("reads the photo and answers the OcrResult at top level with the learned category", async () => {
    stubProviderFetch({
      vendor_name: "Robbie's Automotive",
      transaction_date: "2026-05-27",
      total_amount: 1181,
      suggested_category: "Oil & Lubricants",
      confidence: 0.93,
    });
    db["rpc:match_vendor_by_name"] = {
      data: [{ vendor_id: "v-1", default_category_id: "cat-1" }],
      error: null,
    };
    db["expense_categories:single"] = {
      data: { id: "cat-1", name: "Oil & Lubricants" },
      error: null,
    };
    const res = await billingRouter.request("/v1/billing/receipt-ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_base64: "QUJD", mime_type: "image/jpeg" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeUndefined();
    expect(body.extracted.vendor_name).toBe("Robbie's Automotive");
    expect(body.extracted.total_amount).toBe(1181);
    expect(body.category).toEqual({
      id: "cat-1",
      name: "Oil & Lubricants",
      source: "learned",
    });
  });

  it("answers 503 not-configured when no vision key is set — never the old proxy fallback", async () => {
    delete process.env.RECEIPT_PARSE_AI_API_KEY;
    const res = await billingRouter.request("/v1/billing/receipt-ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_base64: "QUJD", mime_type: "image/jpeg" }),
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("receipt_parse_not_configured");
    expect(body.error.message).toMatch(/not configured/);
    expect(body.error.message).not.toMatch(/payment service/);
  });
});

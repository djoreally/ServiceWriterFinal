/**
 * Grey-box tests for the Document Intake parse + approve routes —
 * the Sovereign Ledger receipt reader's intake door.
 *
 * The provider is stubbed at global.fetch (Gemini wire shape); the
 * Supabase harness supplies the stored document and captures the
 * row writes, so the honest-failure contract (parse_failed + reason,
 * never a stored empty parse) and approve idempotency are asserted
 * at the route boundary.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
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
  calls,
  db,
  resetHarness,
  USER_ID,
} from "../test-support/state";

const documentsRouter = testRouter(documentsRouterRaw);

const DOC_ID = "cc0e8400-e29b-41d4-a716-446655440003";

const PENDING_DOC = {
  id: DOC_ID,
  user_id: USER_ID,
  file_path: `${USER_ID}/receipt.jpg`,
  file_name: "robbies-49576.jpg",
  mime_type: "image/jpeg",
  profile: "general",
  parse_status: "pending",
  review_status: "pending_review",
  parsed_json: null,
  confidence: null,
};

const ROBBIES_MODEL_ANSWER = {
  vendor_name: "Robbie's Automotive",
  transaction_date: "2026-05-27",
  reference_number: "49576",
  total_amount: 1181,
  payment_method: "cash",
  line_items: [
    { description: "0W-20 SYN drum", quantity: 1, unit_price: 765, line_total: 765 },
    { description: "5W-20 SYN 6-gal", quantity: 2, unit_price: 104, line_total: 208 },
    { description: "5W-30 SYN 6-gal", quantity: 2, unit_price: 104, line_total: 208 },
  ],
  confidence: 0.93,
};

const realFetch = globalThis.fetch;

function stubProviderFetch(payload: unknown, ok = true, status = 200) {
  globalThis.fetch = jest.fn(async () => ({
    ok,
    status,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
    }),
  })) as unknown as typeof fetch;
}

beforeEach(() => {
  resetHarness();
  process.env.GEMINI_API_KEY = "test-key";
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.GEMINI_API_KEY;
});

describe("POST /v1/document-intake/:id/parse", () => {
  it("parses the stored receipt and answers the triggerDocumentParse contract", async () => {
    db["document_intake:single"] = { data: { ...PENDING_DOC }, error: null };
    stubProviderFetch(ROBBIES_MODEL_ANSWER);
    const res = await documentsRouter.request(`/v1/document-intake/${DOC_ID}/parse`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.success).toBe(true);
    expect(body.data.method).toBe("gemini:gemini-2.5-flash");
    expect(body.data.extracted.vendor_name).toBe("Robbie's Automotive");
    expect(body.data.extracted.total_amount).toBe(1181);
    const patches = calls.updates
      .filter((u) => u.table === "document_intake")
      .map((u) => u.patch as Record<string, unknown>);
    expect(patches.some((p) => p.parse_status === "parsing")).toBe(true);
    expect(patches.some((p) => p.parse_status === "parsed")).toBe(true);
  });

  it("provider failure → 422, row records parse_failed, and no patch ever carries parsed_json", async () => {
    db["document_intake:single"] = { data: { ...PENDING_DOC }, error: null };
    stubProviderFetch({}, false, 500);
    const res = await documentsRouter.request(`/v1/document-intake/${DOC_ID}/parse`, {
      method: "POST",
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("parse_failed");
    const patches = calls.updates
      .filter((u) => u.table === "document_intake")
      .map((u) => u.patch as Record<string, unknown>);
    const failure = patches[patches.length - 1];
    expect(failure.parse_status).toBe("parse_failed");
    expect(String(failure.parse_error)).toMatch(/500/);
    for (const patch of patches) {
      expect(patch).not.toHaveProperty("parsed_json");
    }
  });

  it("returns 404 for a document the caller does not own", async () => {
    db["document_intake:single"] = { data: null, error: null };
    stubProviderFetch(ROBBIES_MODEL_ANSWER);
    const res = await documentsRouter.request(`/v1/document-intake/${DOC_ID}/parse`, {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /v1/document-intake/:id/approve — idempotency", () => {
  const PARSED_DOC = {
    ...PENDING_DOC,
    parse_status: "parsed",
    parsed_json: {
      vendor_name: "Robbie's Automotive",
      transaction_date: "2026-05-27",
      subtotal: 1181,
      tax_amount: 0,
      total_amount: 1181,
      payment_method: "cash",
      reference_number: "49576",
      line_items: ROBBIES_MODEL_ANSWER.line_items,
    },
  };

  it("creates exactly one expense, and a second approve creates none", async () => {
    db["document_intake:single"] = { data: { ...PARSED_DOC }, error: null };
    db["rpc:match_vendor_by_name"] = { data: [], error: null };
    db["expenses:single"] = { data: { id: "exp-1" }, error: null };

    const first = await documentsRouter.request(
      `/v1/document-intake/${DOC_ID}/approve`,
      { method: "POST" }
    );
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.data.expense_id).toBe("exp-1");
    const expenseInserts = () => calls.inserts.filter((i) => i.table === "expenses");
    expect(expenseInserts()).toHaveLength(1);

    // The row is now approved with the promoted id (the first call's
    // own update wrote it); a repeat approve must early-return the
    // same ids instead of inserting a second expense.
    db["document_intake:single"] = {
      data: {
        ...PARSED_DOC,
        review_status: "approved",
        promoted_expense_id: "exp-1",
        promoted_fuel_log_id: null,
        promoted_work_order_id: null,
      },
      error: null,
    };
    const second = await documentsRouter.request(
      `/v1/document-intake/${DOC_ID}/approve`,
      { method: "POST" }
    );
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.data.expense_id).toBe("exp-1");
    expect(expenseInserts()).toHaveLength(1);
  });
});

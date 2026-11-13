/**
 * Service tests for the Sovereign Ledger receipt reader.
 *
 * The fake Supabase client below records every document_intake
 * update patch so the no-poisoning rule can be asserted directly:
 * on ANY failure the patches may carry parse_status + parse_error
 * only — parsed_json must never appear in a failure write.
 *
 * Extraction fixtures mirror the real MOMS receipts from the
 * 2026-11-13 cash tie-out (Robbie's Automotive #49576).
 */
import { describe, it, expect, jest } from "@jest/globals";
import { normalizeReceiptExtraction } from "@/application/commands/receipt-parse.command";
import {
  isIntakeParseFailure,
  ReceiptParseNotConfiguredError,
  ReceiptParseProviderError,
  resolveReceiptScanCategory,
  runIntakeDocumentParse,
  runReceiptScan,
  type IntakeDocumentForParse,
} from "../receipt-parse.service";

const USER_ID = "660e8400-e29b-41d4-a716-446655440001";
const DOC: IntakeDocumentForParse = {
  id: "cc0e8400-e29b-41d4-a716-446655440003",
  user_id: USER_ID,
  file_path: `${USER_ID}/receipt.jpg`,
  mime_type: "image/jpeg",
  profile: "general",
};

const ROBBIES_EXTRACTION = {
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

function geminiBody(payload: unknown) {
  return {
    candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
  };
}

function fakeBlob() {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  return {
    arrayBuffer: async () => bytes.buffer,
    text: async () => "receipt text",
  };
}

interface FakeOptions {
  downloadError?: boolean;
  fleetVehicle?: { id: string } | null;
  rpcResult?: unknown;
  categoryRow?: { id: string; name: string } | null;
}

function makeFakeSupabase(opts: FakeOptions = {}) {
  const patches: Array<Record<string, unknown>> = [];
  const rpcCalls: Array<{ fn: string; params: unknown }> = [];
  const chain = (result: unknown) => {
    const self: Record<string, unknown> = {
      eq: () => self,
      ilike: () => self,
      select: () => self,
      maybeSingle: async () => result,
      then: (resolve: (v: unknown) => void) => resolve(result),
    };
    return self;
  };
  const supabase = {
    from: (table: string) => {
      if (table === "document_intake") {
        return {
          update: (patch: Record<string, unknown>) => {
            patches.push(patch);
            return chain({ data: null, error: null });
          },
        };
      }
      if (table === "fleet_vehicles") {
        return chain({ data: opts.fleetVehicle ?? null, error: null });
      }
      if (table === "expense_categories") {
        return chain({ data: opts.categoryRow ?? null, error: null });
      }
      return chain({ data: null, error: null });
    },
    rpc: async (fn: string, params: unknown) => {
      rpcCalls.push({ fn, params });
      return { data: opts.rpcResult ?? null, error: null };
    },
    storage: {
      from: () => ({
        download: async () =>
          opts.downloadError
            ? { data: null, error: { message: "gone" } }
            : { data: fakeBlob(), error: null },
      }),
    },
  };
  return { supabase, patches, rpcCalls };
}

function fetchReturning(body: unknown, ok = true, status = 200) {
  return jest.fn(async () => ({
    ok,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

/** A provider failure whose body arrives as raw text, as fetch gives it. */
function fetchFailingWithBody(status: number, bodyText: string) {
  return jest.fn(async () => ({
    ok: false,
    status,
    text: async () => bodyText,
    json: async () => {
      throw new Error("error body is not JSON");
    },
  })) as unknown as typeof fetch;
}

const GOOGLE_404_BODY = JSON.stringify({
  error: {
    code: 404,
    message:
      "models/gemini-2.5-flash is not found for API version v1beta, or is not supported for generateContent. Call ListModels to see the list of available models and their supported methods.",
    status: "NOT_FOUND",
  },
});

const ENV = { GEMINI_API_KEY: "test-key" };

describe("runIntakeDocumentParse", () => {
  it("parses Robbie's #49576 and stores the full extraction as parsed", async () => {
    const { supabase, patches } = makeFakeSupabase();
    const fetchFn = fetchReturning(geminiBody(ROBBIES_EXTRACTION));
    const outcome = await runIntakeDocumentParse(
      { supabase, env: ENV, fetchFn },
      DOC
    );
    expect(outcome.ok).toBe(true);
    if (isIntakeParseFailure(outcome)) return;
    expect(outcome.extraction.vendor_name).toBe("Robbie's Automotive");
    expect(outcome.extraction.total_amount).toBe(1181);
    expect(outcome.method).toBe("gemini:gemini-2.5-flash");

    expect(patches[0]).toEqual({ parse_status: "parsing", parse_error: null });
    const saved = patches[patches.length - 1];
    expect(saved.parse_status).toBe("parsed");
    expect(saved.parse_method).toBe("gemini:gemini-2.5-flash");
    expect(saved.parse_error).toBeNull();
    expect((saved.parsed_json as { total_amount: number }).total_amount).toBe(1181);
    expect(saved.confidence).toBe(0.93);
  });

  it("provider HTTP failure → parse_failed with reason, and NO parsed_json is ever written", async () => {
    const { supabase, patches } = makeFakeSupabase();
    const fetchFn = fetchReturning({}, false, 500);
    const outcome = await runIntakeDocumentParse({ supabase, env: ENV, fetchFn }, DOC);
    expect(outcome.ok).toBe(false);
    if (!isIntakeParseFailure(outcome)) return;
    expect(outcome.reason).toMatch(/500/);
    const failure = patches[patches.length - 1];
    expect(failure.parse_status).toBe("parse_failed");
    expect(failure.parse_error).toBe(outcome.reason);
    for (const patch of patches) {
      expect(patch).not.toHaveProperty("parsed_json");
    }
  });

  it("provider 404 → parse_error carries the provider's OWN stated reason, not a bare status", async () => {
    // The 2026-11-13 production acceptance run failed every receipt
    // with HTTP 404 and the old service discarded the body, leaving
    // nothing to diagnose. The recorded parse_error must now state
    // Google's reason verbatim (truncated excerpt).
    const { supabase, patches } = makeFakeSupabase();
    const fetchFn = fetchFailingWithBody(404, GOOGLE_404_BODY);
    const outcome = await runIntakeDocumentParse({ supabase, env: ENV, fetchFn }, DOC);
    expect(outcome.ok).toBe(false);
    if (!isIntakeParseFailure(outcome)) return;
    expect(outcome.reason).toMatch(/HTTP 404/);
    expect(outcome.reason).toContain("is not found for API version v1beta");
    const failure = patches[patches.length - 1];
    expect(failure.parse_status).toBe("parse_failed");
    expect(failure.parse_error).toBe(outcome.reason);
    for (const patch of patches) {
      expect(patch).not.toHaveProperty("parsed_json");
    }
  });

  it("the recorded provider excerpt never contains the API key, even if the body echoes it", async () => {
    const { supabase, patches } = makeFakeSupabase();
    const fetchFn = fetchFailingWithBody(
      400,
      `{"error":{"message":"bad request for key test-key — retry"}}`
    );
    const outcome = await runIntakeDocumentParse({ supabase, env: ENV, fetchFn }, DOC);
    expect(outcome.ok).toBe(false);
    const failure = patches[patches.length - 1];
    expect(String(failure.parse_error)).not.toContain("test-key");
    expect(String(failure.parse_error)).toContain("[redacted]");
  });

  it("a huge provider error body is truncated in the recorded parse_error", async () => {
    const { supabase, patches } = makeFakeSupabase();
    const fetchFn = fetchFailingWithBody(502, `upstream said ${"x".repeat(5000)}`);
    const outcome = await runIntakeDocumentParse({ supabase, env: ENV, fetchFn }, DOC);
    expect(outcome.ok).toBe(false);
    const failure = patches[patches.length - 1];
    expect(String(failure.parse_error)).toContain("…");
    expect(String(failure.parse_error).length).toBeLessThan(600);
  });

  it("an unreadable document (model reads nothing usable) → honest parse_failed, no poisoning", async () => {
    const { supabase, patches } = makeFakeSupabase();
    const fetchFn = fetchReturning(geminiBody({}));
    const outcome = await runIntakeDocumentParse({ supabase, env: ENV, fetchFn }, DOC);
    expect(outcome.ok).toBe(false);
    const failure = patches[patches.length - 1];
    expect(failure.parse_status).toBe("parse_failed");
    expect(String(failure.parse_error)).toMatch(/Nothing readable/);
    for (const patch of patches) {
      expect(patch).not.toHaveProperty("parsed_json");
    }
  });

  it("no provider key configured → parse_failed with the configuration reason; provider never called", async () => {
    const { supabase, patches } = makeFakeSupabase();
    const fetchFn = fetchReturning(geminiBody(ROBBIES_EXTRACTION));
    const outcome = await runIntakeDocumentParse({ supabase, env: {}, fetchFn }, DOC);
    expect(outcome.ok).toBe(false);
    if (!isIntakeParseFailure(outcome)) return;
    expect(outcome.reason).toMatch(/not configured/);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(patches).toHaveLength(1);
    expect(patches[0].parse_status).toBe("parse_failed");
  });

  it("a storage download failure → parse_failed, document stays re-parseable", async () => {
    const { supabase, patches } = makeFakeSupabase({ downloadError: true });
    const fetchFn = fetchReturning(geminiBody(ROBBIES_EXTRACTION));
    const outcome = await runIntakeDocumentParse({ supabase, env: ENV, fetchFn }, DOC);
    expect(outcome.ok).toBe(false);
    expect(patches[patches.length - 1].parse_status).toBe("parse_failed");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("service profile: a valid VIN is validated and linked to its fleet vehicle", async () => {
    const { supabase, patches } = makeFakeSupabase({ fleetVehicle: { id: "veh-1" } });
    const fetchFn = fetchReturning(
      geminiBody({
        vendor_name: "Robbie's Automotive",
        total_amount: 815,
        vin: "1FTBR1Y86PKB51521",
        mileage: 57700,
      })
    );
    const outcome = await runIntakeDocumentParse(
      { supabase, env: ENV, fetchFn },
      { ...DOC, profile: "service" }
    );
    expect(outcome.ok).toBe(true);
    if (isIntakeParseFailure(outcome)) return;
    expect(outcome.vin).toBe("1FTBR1Y86PKB51521");
    expect(outcome.vinValid).toBe(true);
    expect(outcome.fleetVehicleId).toBe("veh-1");
    const saved = patches[patches.length - 1];
    expect(saved.extracted_vin).toBe("1FTBR1Y86PKB51521");
    expect(saved.vin_valid).toBe(true);
    expect(saved.fleet_vehicle_id).toBe("veh-1");
  });

  it("an invalid VIN is stored as read but flagged invalid and never linked", async () => {
    const { supabase, patches } = makeFakeSupabase({ fleetVehicle: { id: "veh-1" } });
    const fetchFn = fetchReturning(
      geminiBody({ vendor_name: "X", total_amount: 10, vin: "TOOSHORT" })
    );
    const outcome = await runIntakeDocumentParse(
      { supabase, env: ENV, fetchFn },
      { ...DOC, profile: "service" }
    );
    expect(outcome.ok).toBe(true);
    if (isIntakeParseFailure(outcome)) return;
    expect(outcome.vinValid).toBe(false);
    expect(outcome.fleetVehicleId).toBeNull();
    expect(patches[patches.length - 1].vin_valid).toBe(false);
  });
});

describe("runReceiptScan", () => {
  it("throws the not-configured error when no key exists", async () => {
    const { supabase } = makeFakeSupabase();
    await expect(
      runReceiptScan(
        { supabase, env: {}, fetchFn: fetchReturning(geminiBody(ROBBIES_EXTRACTION)) },
        { imageBase64: "QUJD", mimeType: "image/jpeg" }
      )
    ).rejects.toBeInstanceOf(ReceiptParseNotConfiguredError);
  });

  it("returns the extraction for a scanned photo", async () => {
    const { supabase } = makeFakeSupabase();
    const extraction = await runReceiptScan(
      { supabase, env: ENV, fetchFn: fetchReturning(geminiBody(ROBBIES_EXTRACTION)) },
      { imageBase64: "QUJD", mimeType: "image/jpeg" }
    );
    expect(extraction.vendor_name).toBe("Robbie's Automotive");
    expect(extraction.total_amount).toBe(1181);
  });

  it("a provider failure keeps the user-facing message short but carries the provider detail on the error", async () => {
    const { supabase } = makeFakeSupabase();
    const thrown = await runReceiptScan(
      { supabase, env: ENV, fetchFn: fetchFailingWithBody(404, GOOGLE_404_BODY) },
      { imageBase64: "QUJD", mimeType: "image/jpeg" }
    ).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(ReceiptParseProviderError);
    const err = thrown as ReceiptParseProviderError;
    // The route surfaces err.message to the user — it stays short and
    // honest, without the raw provider body…
    expect(err.message).toMatch(/HTTP 404/);
    expect(err.message).not.toContain("NOT_FOUND");
    // …while the verbatim reason rides along for logs/diagnosis.
    expect(err.providerDetail).toContain("is not found for API version v1beta");
  });
});

describe("resolveReceiptScanCategory", () => {
  const extraction = normalizeReceiptExtraction(
    JSON.stringify({
      vendor_name: "Robbie's Automotive",
      total_amount: 1181,
      suggested_category: "Oil & Lubricants",
    })
  )!;

  it("prefers the vendor-learned category from the matcher RPC", async () => {
    const { supabase, rpcCalls } = makeFakeSupabase({
      rpcResult: [{ vendor_id: "v-1", default_category_id: "cat-1" }],
      categoryRow: { id: "cat-1", name: "Oil & Lubricants" },
    });
    const resolved = await resolveReceiptScanCategory(
      { supabase, env: ENV },
      USER_ID,
      extraction
    );
    expect(rpcCalls[0].fn).toBe("match_vendor_by_name");
    expect(resolved).toEqual({ id: "cat-1", name: "Oil & Lubricants", source: "learned" });
  });

  it("falls back to the AI-suggested category matched against the shop's categories", async () => {
    const { supabase } = makeFakeSupabase({
      rpcResult: [],
      categoryRow: { id: "cat-9", name: "Oil & Lubricants" },
    });
    const resolved = await resolveReceiptScanCategory(
      { supabase, env: ENV },
      USER_ID,
      extraction
    );
    expect(resolved).toEqual({ id: "cat-9", name: "Oil & Lubricants", source: "ai_suggested" });
  });

  it("answers unmatched (carrying the suggestion as the name) when nothing resolves", async () => {
    const { supabase } = makeFakeSupabase({ rpcResult: [], categoryRow: null });
    const resolved = await resolveReceiptScanCategory(
      { supabase, env: ENV },
      USER_ID,
      extraction
    );
    expect(resolved).toEqual({ id: null, name: "Oil & Lubricants", source: "unmatched" });
  });
});

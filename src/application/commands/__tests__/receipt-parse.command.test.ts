/**
 * Unit tests for the receipt reader's pure planning/normalization
 * module. Fixtures are modeled on the real MOMS oil receipts parsed
 * in the 2026-11-13 cash tie-out (Robbie's Automotive invoices
 * 49576 / 46808, A to Z Automotive Lubricants invoices) — same
 * vendors, dates, line items and totals the production re-parse
 * acceptance step will compare against.
 */
import { describe, it, expect } from "@jest/globals";
import {
  buildReceiptParseProviderCall,
  normalizeReceiptExtraction,
  planReceiptParseRequest,
  readReceiptParseConfig,
  receiptExtractionInstruction,
  receiptProviderAnswerText,
  type ReceiptParseConfig,
} from "../receipt-parse.command";

const OPENAI: ReceiptParseConfig = {
  provider: "openai-compatible",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "openai-key",
  model: "gpt-4o-mini",
};

describe("readReceiptParseConfig", () => {
  it("is null with no key at all — both doors must answer not-configured", () => {
    expect(readReceiptParseConfig({})).toBeNull();
    expect(readReceiptParseConfig({ RECEIPT_PARSE_AI_API_KEY: "  " })).toBeNull();
    expect(readReceiptParseConfig({ RECEIPT_PARSE_MODEL: "x" })).toBeNull();
  });

  it("IGNORES GEMINI_API_KEY — the reader makes zero Google calls (bridge pulled 2026-11-13)", () => {
    // Even with Google's key provisioned in the environment, the
    // receipt reader must not resolve a provider from it: with no
    // RECEIPT_PARSE_AI_* endpoint the reader is honestly
    // not-configured, and when one IS configured it wins outright.
    expect(readReceiptParseConfig({ GEMINI_API_KEY: "k" })).toBeNull();
    expect(
      readReceiptParseConfig({ GEMINI_API_KEY: "g", RECEIPT_PARSE_AI_API_KEY: "r" })
    ).toEqual({
      provider: "openai-compatible",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "r",
      model: "gpt-4o-mini",
    });
  });

  it("reads the RECEIPT_PARSE_AI_* endpoint — base URL and model, with defaults", () => {
    expect(readReceiptParseConfig({ RECEIPT_PARSE_AI_API_KEY: "rk" })).toEqual({
      provider: "openai-compatible",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "rk",
      model: "gpt-4o-mini",
    });
    expect(
      readReceiptParseConfig({
        RECEIPT_PARSE_AI_API_KEY: "rk",
        RECEIPT_PARSE_AI_BASE_URL: "https://vision.example.test/v1/",
      })?.baseUrl
    ).toBe("https://vision.example.test/v1");
    expect(
      readReceiptParseConfig({
        RECEIPT_PARSE_AI_API_KEY: "rk",
        RECEIPT_PARSE_AI_MODEL: "qwen3-vl-8b",
      })?.model
    ).toBe("qwen3-vl-8b");
  });

  it("honors RECEIPT_PARSE_MODEL only as a generic model override, never as a Google path", () => {
    expect(
      readReceiptParseConfig({
        RECEIPT_PARSE_AI_API_KEY: "rk",
        RECEIPT_PARSE_MODEL: "override-model",
      })?.model
    ).toBe("override-model");
    expect(
      readReceiptParseConfig({
        RECEIPT_PARSE_AI_API_KEY: "rk",
        RECEIPT_PARSE_AI_MODEL: "endpoint-model",
        RECEIPT_PARSE_MODEL: "override-model",
      })?.model
    ).toBe("endpoint-model");
  });

  it("no longer falls back to the VIN door's keys — each door owns its config", () => {
    expect(readReceiptParseConfig({ VIN_OCR_AI_API_KEY: "vk" })).toBeNull();
    expect(
      readReceiptParseConfig({ VIN_OCR_AI_API_KEY: "vk", VIN_OCR_MODEL: "m" })
    ).toBeNull();
  });
});

describe("planReceiptParseRequest", () => {
  it("accepts a base64 photo and defaults the mime type to jpeg", () => {
    expect(planReceiptParseRequest({ image_base64: "QUJD" })).toEqual({
      request: { imageBase64: "QUJD", mimeType: "image/jpeg" },
      error: null,
    });
  });

  it("strips a data-URI prefix and accepts PDFs", () => {
    expect(
      planReceiptParseRequest({
        image_base64: "data:application/pdf;base64,QUJD",
        mime_type: "application/pdf",
      })
    ).toEqual({ request: { imageBase64: "QUJD", mimeType: "application/pdf" }, error: null });
  });

  it("rejects a missing photo and non-receipt file types", () => {
    expect(planReceiptParseRequest({}).request).toBeNull();
    expect(planReceiptParseRequest("nope").request).toBeNull();
    expect(
      planReceiptParseRequest({ image_base64: "QUJD", mime_type: "text/html" }).request
    ).toBeNull();
  });

  it("rejects an oversized file", () => {
    const huge = "A".repeat(12_000_001);
    expect(planReceiptParseRequest({ image_base64: huge }).error).toMatch(/too large/);
  });
});

describe("buildReceiptParseProviderCall", () => {
  it("builds the OpenAI chat call with an image_url part for photos", () => {
    const call = buildReceiptParseProviderCall(OPENAI, {
      profile: "general",
      mimeType: "image/png",
      base64: "QUJD",
    });
    expect(call.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(call.init.method).toBe("POST");
    expect(call.init.headers.Authorization).toBe("Bearer openai-key");
    const body = JSON.parse(call.init.body);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages[0]).toEqual({
      role: "system",
      content: receiptExtractionInstruction("general"),
    });
    expect(body.messages[0].content).toMatch(/crossed out or voided, exclude it/);
    const userParts = body.messages[1].content;
    expect(userParts[1]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/png;base64,QUJD" },
    });
    // Zero Google surface in the built call — no Google host, no
    // Google auth header, no generateContent wire shape.
    expect(call.url).not.toContain("generativelanguage.googleapis.com");
    expect(call.init.headers).not.toHaveProperty("x-goog-api-key");
    expect(call.init.body).not.toContain("inlineData");
    expect(call.init.body).not.toContain("generateContent");
  });

  it("sends text documents as a single text part", () => {
    const call = buildReceiptParseProviderCall(OPENAI, {
      profile: "general",
      mimeType: "text/plain",
      text: "Vendor: Robbie's Automotive Total: 1181.00",
    });
    const body = JSON.parse(call.init.body);
    expect(body.messages[1].content).toEqual([
      { type: "text", text: "Vendor: Robbie's Automotive Total: 1181.00" },
    ]);
  });

  it("uses a file part for PDFs on the OpenAI-compatible shape", () => {
    const call = buildReceiptParseProviderCall(OPENAI, {
      profile: "general",
      mimeType: "application/pdf",
      base64: "QUJD",
    });
    const userParts = JSON.parse(call.init.body).messages[1].content;
    expect(userParts[1].type).toBe("file");
    expect(userParts[1].file.file_data).toBe("data:application/pdf;base64,QUJD");
  });
});

describe("receiptProviderAnswerText", () => {
  it("reads OpenAI choices", () => {
    expect(
      receiptProviderAnswerText("openai-compatible", {
        choices: [{ message: { content: "{\"a\":1}" } }],
      })
    ).toBe('{"a":1}');
  });

  it("returns null for empty or malformed provider bodies", () => {
    expect(receiptProviderAnswerText("openai-compatible", null)).toBeNull();
    expect(receiptProviderAnswerText("openai-compatible", { choices: [] })).toBeNull();
    // A Gemini-shaped body is not readable here anymore — no
    // candidates arm exists in the reader.
    expect(
      receiptProviderAnswerText("openai-compatible", {
        candidates: [{ content: { parts: [{ text: "{\"a\":1}" }] } }],
      })
    ).toBeNull();
  });
});

describe("normalizeReceiptExtraction", () => {
  it("normalizes Robbie's Automotive invoice 49576 (2026-05-27, $1,181.00)", () => {
    const extraction = normalizeReceiptExtraction(
      JSON.stringify({
        vendor_name: "Robbie's Automotive",
        transaction_date: "05/27/2026",
        reference_number: 49576,
        total_amount: "$1,181.00",
        payment_method: "Cash",
        line_items: [
          { description: "0W-20 SYN drum", quantity: 1, unit_price: 765, line_total: 765 },
          { description: "5W-20 SYN 6-gal", quantity: 2, unit_price: 104, line_total: 208 },
          { description: "5W-30 SYN 6-gal", quantity: 2, unit_price: 104, line_total: 208 },
        ],
        confidence: 0.93,
      })
    );
    expect(extraction).not.toBeNull();
    expect(extraction?.vendor_name).toBe("Robbie's Automotive");
    expect(extraction?.transaction_date).toBe("2026-05-27");
    expect(extraction?.reference_number).toBe("49576");
    expect(extraction?.total_amount).toBe(1181);
    expect(extraction?.payment_method).toBe("cash");
    expect(extraction?.line_items).toHaveLength(3);
    expect(extraction?.line_items[0].line_total).toBe(765);
    expect(extraction?.confidence).toBe(0.93);
  });

  it("computes a missing line total from quantity × unit price (A to Z 133392 shape)", () => {
    const extraction = normalizeReceiptExtraction(
      JSON.stringify({
        vendor_name: "A to Z Automotive Lubricants",
        transaction_date: "2026-08-14",
        total_amount: 1440,
        line_items: [
          { description: "0W-20 FS", quantity: 2, unit_price: 240 },
          { description: "5W-20 FS", quantity: 2, unit_price: 240 },
          { description: "5W-30 FS", quantity: 2, unit_price: 240 },
        ],
      })
    );
    expect(extraction?.line_items.map((li) => li.line_total)).toEqual([480, 480, 480]);
  });

  it("rejects impossible dates instead of storing them", () => {
    const extraction = normalizeReceiptExtraction(
      JSON.stringify({ vendor_name: "X", transaction_date: "2026-02-30", total_amount: 10 })
    );
    expect(extraction?.transaction_date).toBeNull();
  });

  it("maps payment synonyms, keeps only a true last4, and cleans the VIN", () => {
    const extraction = normalizeReceiptExtraction(
      JSON.stringify({
        vendor_name: "Service Co",
        total_amount: 50,
        payment_method: "Credit Card",
        last4: "card ending 4242",
        vin: "1ftbr1y86pkb51521",
      })
    );
    expect(extraction?.payment_method).toBe("card");
    expect(extraction?.last4).toBe("4242");
    expect(extraction?.vin).toBe("1FTBR1Y86PKB51521");
    const badLast4 = normalizeReceiptExtraction(
      JSON.stringify({ vendor_name: "Service Co", total_amount: 50, last4: "42" })
    );
    expect(badLast4?.last4).toBeNull();
  });

  it("clamps confidence and defaults it when absent", () => {
    expect(
      normalizeReceiptExtraction(JSON.stringify({ vendor_name: "X", confidence: 1.7 }))
        ?.confidence
    ).toBe(1);
    expect(
      normalizeReceiptExtraction(JSON.stringify({ vendor_name: "X" }))?.confidence
    ).toBe(0.5);
  });

  it("returns null for an empty or unreadable answer — never an empty success", () => {
    expect(normalizeReceiptExtraction("{}")).toBeNull();
    expect(normalizeReceiptExtraction("not json at all")).toBeNull();
    expect(normalizeReceiptExtraction(null)).toBeNull();
    expect(
      normalizeReceiptExtraction(JSON.stringify({ line_items: [], confidence: 0.1 }))
    ).toBeNull();
  });

  it("tolerates fenced JSON from the model", () => {
    const extraction = normalizeReceiptExtraction(
      "```json\n{\"vendor_name\":\"Robbie's Automotive\",\"total_amount\":815}\n```"
    );
    expect(extraction?.total_amount).toBe(815);
  });
});

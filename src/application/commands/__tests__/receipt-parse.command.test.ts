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

const GEMINI: ReceiptParseConfig = {
  provider: "gemini",
  baseUrl: "https://generativelanguage.googleapis.com/v1beta",
  apiKey: "gemini-key",
  model: "gemini-2.5-flash",
};
const OPENAI: ReceiptParseConfig = {
  provider: "openai-compatible",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "openai-key",
  model: "gpt-4o-mini",
};

describe("readReceiptParseConfig", () => {
  it("is null with no key at all — both doors must answer not-configured", () => {
    expect(readReceiptParseConfig({})).toBeNull();
    expect(readReceiptParseConfig({ GEMINI_API_KEY: "  " })).toBeNull();
    expect(readReceiptParseConfig({ RECEIPT_PARSE_MODEL: "x" })).toBeNull();
  });

  it("reads GEMINI_API_KEY first — the key the platform already provisions", () => {
    expect(readReceiptParseConfig({ GEMINI_API_KEY: "k" })).toEqual({
      provider: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      apiKey: "k",
      model: "gemini-2.5-flash",
    });
  });

  it("honors RECEIPT_PARSE_MODEL, then VIN_OCR_MODEL, as the override", () => {
    expect(
      readReceiptParseConfig({ GEMINI_API_KEY: "k", RECEIPT_PARSE_MODEL: "gemini-pro" })?.model
    ).toBe("gemini-pro");
    expect(
      readReceiptParseConfig({ GEMINI_API_KEY: "k", VIN_OCR_MODEL: "gemini-vin" })?.model
    ).toBe("gemini-vin");
  });

  it("falls back to a receipt-specific OpenAI-compatible key, then the VIN door's", () => {
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
    expect(readReceiptParseConfig({ VIN_OCR_AI_API_KEY: "vk" })?.provider).toBe(
      "openai-compatible"
    );
    // Gemini still wins when several keys exist.
    expect(
      readReceiptParseConfig({ GEMINI_API_KEY: "g", RECEIPT_PARSE_AI_API_KEY: "r" })?.provider
    ).toBe("gemini");
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
  it("builds the Gemini generateContent call — the exact documented camelCase wire shape", () => {
    const call = buildReceiptParseProviderCall(GEMINI, {
      profile: "general",
      mimeType: "image/jpeg",
      base64: "QUJD",
    });
    expect(call.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
    );
    expect(call.init.method).toBe("POST");
    expect(call.init.headers).toEqual({
      "x-goog-api-key": "gemini-key",
      "Content-Type": "application/json",
    });
    // The EXACT serialized body, field names included. Google's
    // generateContent REST shape is camelCase (inlineData / mimeType
    // / responseMimeType); the snake_case proto names shipped first
    // and production answered HTTP 404 on every receipt (2026-11-13).
    // This deep-equal + the substring bans below pin the shape so it
    // cannot regress silently.
    expect(JSON.parse(call.init.body)).toEqual({
      contents: [
        {
          parts: [
            {
              text: `${receiptExtractionInstruction("general")}\n\nExtract the expense data from this document.`,
            },
            { inlineData: { mimeType: "image/jpeg", data: "QUJD" } },
          ],
        },
      ],
      generationConfig: { responseMimeType: "application/json" },
    });
    expect(JSON.parse(call.init.body).contents[0].parts[0].text).toMatch(
      /crossed out or voided, exclude it/
    );
    expect(call.init.body).not.toContain("inline_data");
    expect(call.init.body).not.toContain("response_mime_type");
    expect(call.init.body).not.toContain("mime_type");
  });

  it("sends text documents to Gemini as a second text part (no inlineData)", () => {
    const call = buildReceiptParseProviderCall(GEMINI, {
      profile: "general",
      mimeType: "text/plain",
      text: "Vendor: Robbie's Automotive Total: 1181.00",
    });
    const body = JSON.parse(call.init.body);
    expect(body.contents[0].parts).toHaveLength(2);
    expect(body.contents[0].parts[1]).toEqual({
      text: "Vendor: Robbie's Automotive Total: 1181.00",
    });
    expect(body.generationConfig).toEqual({ responseMimeType: "application/json" });
  });

  it("builds the OpenAI chat call with an image_url part for photos", () => {
    const call = buildReceiptParseProviderCall(OPENAI, {
      profile: "general",
      mimeType: "image/png",
      base64: "QUJD",
    });
    expect(call.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(call.init.headers.Authorization).toBe("Bearer openai-key");
    const body = JSON.parse(call.init.body);
    expect(body.response_format).toEqual({ type: "json_object" });
    const userParts = body.messages[1].content;
    expect(userParts[1]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/png;base64,QUJD" },
    });
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
  it("joins Gemini candidate parts and reads OpenAI choices", () => {
    expect(
      receiptProviderAnswerText("gemini", {
        candidates: [{ content: { parts: [{ text: "{\"a\":" }, { text: "1}" }] } }],
      })
    ).toBe('{"a":1}');
    expect(
      receiptProviderAnswerText("openai-compatible", {
        choices: [{ message: { content: "{\"a\":1}" } }],
      })
    ).toBe('{"a":1}');
  });

  it("returns null for empty or malformed provider bodies", () => {
    expect(receiptProviderAnswerText("gemini", null)).toBeNull();
    expect(receiptProviderAnswerText("gemini", { candidates: [] })).toBeNull();
    expect(receiptProviderAnswerText("openai-compatible", { choices: [] })).toBeNull();
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

import { describe, it, expect } from "@jest/globals";
import {
  buildVinOcrProviderCall,
  normalizeVinText,
  parseVinOcrProviderResponse,
  planVinOcrRequest,
  readVinOcrConfig,
} from "../tech-app-vin-ocr.command";

describe("readVinOcrConfig", () => {
  it("is null with no key at all — the door must answer not-configured", () => {
    expect(readVinOcrConfig({})).toBeNull();
    expect(readVinOcrConfig({ GEMINI_API_KEY: "  " })).toBeNull();
    expect(readVinOcrConfig({ VIN_OCR_AI_BASE_URL: "https://example.test/v1" })).toBeNull();
  });

  it("reads GEMINI_API_KEY as the primary provider with the default vision model", () => {
    expect(readVinOcrConfig({ GEMINI_API_KEY: "gem-key" })).toEqual({
      provider: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      apiKey: "gem-key",
      model: "gemini-2.5-flash",
    });
  });

  it("prefers Gemini when both keys are present, and honors a model override", () => {
    const config = readVinOcrConfig({
      GEMINI_API_KEY: "gem-key",
      VIN_OCR_AI_API_KEY: "other-key",
      VIN_OCR_MODEL: "gemini-custom",
    });
    expect(config?.provider).toBe("gemini");
    expect(config?.model).toBe("gemini-custom");
  });

  it("falls back to an OpenAI-compatible endpoint from VIN_OCR_AI_*", () => {
    expect(readVinOcrConfig({ VIN_OCR_AI_API_KEY: "key-1" })).toEqual({
      provider: "openai-compatible",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "key-1",
      model: "gpt-4o-mini",
    });
    expect(
      readVinOcrConfig({
        VIN_OCR_AI_API_KEY: "key-2",
        VIN_OCR_AI_BASE_URL: "https://vision.example.test/v1/",
      })?.baseUrl
    ).toBe("https://vision.example.test/v1");
  });
});

describe("planVinOcrRequest", () => {
  it("accepts a base64 photo and defaults the mime type to jpeg", () => {
    expect(planVinOcrRequest({ image_base64: "QUJD" })).toEqual({
      request: { imageBase64: "QUJD", mimeType: "image/jpeg" },
      error: null,
    });
  });

  it("strips a data-URI prefix and keeps an explicit image mime type", () => {
    expect(
      planVinOcrRequest({ image_base64: "data:image/png;base64,QUJD", mime_type: "image/png" })
    ).toEqual({ request: { imageBase64: "QUJD", mimeType: "image/png" }, error: null });
  });

  it("rejects a missing, blank, or non-image photo", () => {
    expect(planVinOcrRequest(null).request).toBeNull();
    expect(planVinOcrRequest({}).request).toBeNull();
    expect(planVinOcrRequest({ image_base64: " " }).request).toBeNull();
    expect(planVinOcrRequest({ image_base64: 42 }).request).toBeNull();
    expect(
      planVinOcrRequest({ image_base64: "QUJD", mime_type: "application/pdf" }).request
    ).toBeNull();
  });

  it("rejects an oversized photo", () => {
    const plan = planVinOcrRequest({ image_base64: "A".repeat(12_000_001) });
    expect(plan.request).toBeNull();
    expect(plan.error).toMatch(/too large/);
  });
});

describe("buildVinOcrProviderCall", () => {
  it("builds a Gemini generateContent call — the exact documented camelCase wire shape", () => {
    const call = buildVinOcrProviderCall(
      {
        provider: "gemini",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        apiKey: "gem-key",
        model: "gemini-2.5-flash",
      },
      { imageBase64: "QUJD", mimeType: "image/png" }
    );
    expect(call.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
    );
    expect(call.init.method).toBe("POST");
    expect(call.init.headers["x-goog-api-key"]).toBe("gem-key");
    // The EXACT serialized body, field names included. Google's
    // generateContent REST shape is camelCase (inlineData / mimeType
    // / responseMimeType); this door originally shipped the
    // snake_case proto names — the same defect that made the receipt
    // reader's production calls answer HTTP 404 (2026-11-13). The
    // deep-equal + substring bans pin the shape against regression.
    expect(JSON.parse(call.init.body)).toEqual({
      contents: [
        {
          parts: [
            { text: expect.stringContaining("Never invent") },
            { inlineData: { mimeType: "image/png", data: "QUJD" } },
          ],
        },
      ],
      generationConfig: { responseMimeType: "application/json" },
    });
    expect(call.init.body).not.toContain("inline_data");
    expect(call.init.body).not.toContain("response_mime_type");
    expect(call.init.body).not.toContain("mime_type");
  });

  it("builds an OpenAI-compatible chat call carrying the photo as a data URI", () => {
    const call = buildVinOcrProviderCall(
      { provider: "openai-compatible", baseUrl: "https://vision.example.test/v1", apiKey: "key-3", model: "m1" },
      { imageBase64: "QUJD", mimeType: "image/png" }
    );
    expect(call.url).toBe("https://vision.example.test/v1/chat/completions");
    expect(call.init.headers.Authorization).toBe("Bearer key-3");
    const body = JSON.parse(call.init.body);
    expect(body.model).toBe("m1");
    const parts = body.messages[1].content as Array<Record<string, unknown>>;
    const imagePart = parts.find((p) => p.type === "image_url") as {
      image_url: { url: string };
    };
    expect(imagePart.image_url.url).toBe("data:image/png;base64,QUJD");
    expect(body.messages[0].content).toMatch(/Never invent/);
  });
});

describe("normalizeVinText", () => {
  it("uppercases and strips everything that is not a letter or digit", () => {
    expect(normalizeVinText(" 5uxcr-6c09n 9k12345 ")).toBe("5UXCR6C09N9K12345");
  });
});

describe("parseVinOcrProviderResponse", () => {
  const chatBody = (content: string) => ({ choices: [{ message: { content } }] });
  const geminiBody = (text: string) => ({
    candidates: [{ content: { parts: [{ text }] } }],
  });

  it("reads the VIN out of a Gemini JSON answer and normalizes it", () => {
    expect(
      parseVinOcrProviderResponse("gemini", geminiBody('{"vin": "5uxcr6c09n9k12345"}'))
    ).toEqual({ vin: "5UXCR6C09N9K12345" });
  });

  it("reads the VIN out of an OpenAI-compatible JSON answer", () => {
    expect(
      parseVinOcrProviderResponse("openai-compatible", chatBody('{"vin": "5UXCR6C09N9K12345"}'))
    ).toEqual({ vin: "5UXCR6C09N9K12345" });
  });

  it("returns a near-miss read as-is so the tech can correct it", () => {
    expect(
      parseVinOcrProviderResponse("gemini", geminiBody('{"vin": "5UXCR6C09N9K1234"}'))
    ).toEqual({ vin: "5UXCR6C09N9K1234" });
  });

  it("treats a null or empty VIN as no read — never a guess", () => {
    expect(parseVinOcrProviderResponse("gemini", geminiBody('{"vin": null}'))).toEqual({ vin: null });
    expect(parseVinOcrProviderResponse("openai-compatible", chatBody('{"vin": "  "}'))).toEqual({ vin: null });
  });

  it("finds a clean 17-character run in a non-JSON answer", () => {
    expect(
      parseVinOcrProviderResponse("gemini", geminiBody("The VIN reads 5UXCR6C09N9K12345 on the plate."))
    ).toEqual({ vin: "5UXCR6C09N9K12345" });
  });

  it("returns null for unusable answers", () => {
    for (const body of [null, {}, { choices: [] }, { candidates: [] }, chatBody(""), geminiBody("no vin here")]) {
      expect(parseVinOcrProviderResponse("gemini", body)).toEqual({ vin: null });
      expect(parseVinOcrProviderResponse("openai-compatible", body)).toEqual({ vin: null });
    }
  });
});

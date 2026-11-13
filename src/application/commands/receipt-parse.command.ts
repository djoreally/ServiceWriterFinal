/**
 * receipt-parse.command — pure planning for the Sovereign Ledger
 * receipt reader (Document Intake parse + the Scan Receipt door).
 *
 * WHY THIS EXISTS (diagnosis, 2026-11-13): both receipt doors were
 * wired to Supabase Edge Functions that are not there.
 *  - Intake re-parse invoked `expense-document-parse`, whose source
 *    sits in supabase/functions/ but was never deployed — nothing in
 *    the app's deploy path ships edge functions — and which, even
 *    deployed, would have needed its own EXPENSE_PARSE_AI_* function
 *    secrets and wrote parse_status values ("processing"/"failed")
 *    outside the app's vocabulary ("parsing"/"parse_failed").
 *  - Scan Receipt proxied to `expense-receipt-ocr`, a function name
 *    that exists nowhere in the repo, so every scan died behind the
 *    billing proxy's fallback message ("The payment service request
 *    failed.").
 * The reader now runs in-process in the Hono server, following the
 * exact pattern the tech-app VIN photo decode established
 * (src/application/commands/tech-app-vin-ocr.command.ts): this module
 * owns the provider configuration, the request planning, the provider
 * call shape, and the answer parsing/normalization; the service
 * (src/server/expenses/receipt-parse.service.ts) owns storage, the
 * provider call itself, and the document row writes.
 *
 * PROVIDER CONFIGURATION IS ENV-DRIVEN, never hardcoded:
 *   GEMINI_API_KEY          the platform's provisioned vision key
 *                           (the same one the VIN decode door runs
 *                           on; Gemini, default gemini-2.5-flash).
 *   RECEIPT_PARSE_AI_API_KEY  optional receipt-specific key for any
 *                           OpenAI-compatible vision endpoint
 *                           (RECEIPT_PARSE_AI_BASE_URL, default
 *                           https://api.openai.com/v1).
 *   VIN_OCR_AI_API_KEY      the VIN door's generic fallback key is
 *                           honored last, so one provisioned
 *                           OpenAI-compatible key serves both doors.
 *   RECEIPT_PARSE_MODEL     optional model override (falls back to
 *                           VIN_OCR_MODEL, then the provider default).
 * With no key configured the reader answers honestly — the intake row
 * records parse_failed with the configuration reason and the scan
 * door returns a not-configured error — never a fake success.
 */

export type ReceiptParseProvider = "gemini" | "openai-compatible";

export interface ReceiptParseConfig {
  provider: ReceiptParseProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ReceiptParseImage {
  imageBase64: string;
  mimeType: string;
}

/** Exactly one of request / error is non-null (house plan shape). */
export interface ReceiptParseRequestPlan {
  request: ReceiptParseImage | null;
  error: string | null;
}

export interface ReceiptLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

/**
 * The structured extraction. Keys are exactly the parsed_json keys the
 * Document Intake review UI renders and the approve flow consumes —
 * every field is nullable; the reader omits what it cannot see rather
 * than inventing values.
 */
export interface ReceiptExtraction {
  vendor_name: string | null;
  transaction_date: string | null;
  subtotal: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  payment_method: string | null;
  last4: string | null;
  reference_number: string | null;
  line_items: ReceiptLineItem[];
  suggested_category: string | null;
  // Fuel profile
  gallons: number | null;
  price_per_gallon: number | null;
  odometer: number | null;
  fuel_type: string | null;
  station_name: string | null;
  station_location: string | null;
  // Service profile
  vin: string | null;
  mileage: number | null;
  license_plate: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  oil_type: string | null;
  oil_spec: string | null;
  labor_total: number | null;
  parts_total: number | null;
  confidence: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** ~9 MB of document once decoded — a phone photo, not an archive. */
const MAX_IMAGE_BASE64_CHARS = 12_000_000;

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_DEFAULT_MODEL = "gemini-2.5-flash";
const OPENAI_BASE_URL = "https://api.openai.com/v1";
const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";

export function readReceiptParseConfig(
  env: Record<string, string | undefined>
): ReceiptParseConfig | null {
  const modelOverride =
    (env.RECEIPT_PARSE_MODEL ?? "").trim() || (env.VIN_OCR_MODEL ?? "").trim();

  const geminiKey = (env.GEMINI_API_KEY ?? "").trim();
  if (geminiKey !== "") {
    return {
      provider: "gemini",
      baseUrl: GEMINI_BASE_URL,
      apiKey: geminiKey,
      model: modelOverride === "" ? GEMINI_DEFAULT_MODEL : modelOverride,
    };
  }

  const receiptKey = (env.RECEIPT_PARSE_AI_API_KEY ?? "").trim();
  if (receiptKey !== "") {
    const baseUrl = (env.RECEIPT_PARSE_AI_BASE_URL ?? "").trim().replace(/\/$/, "");
    return {
      provider: "openai-compatible",
      baseUrl: baseUrl === "" ? OPENAI_BASE_URL : baseUrl,
      apiKey: receiptKey,
      model: modelOverride === "" ? OPENAI_DEFAULT_MODEL : modelOverride,
    };
  }

  const vinKey = (env.VIN_OCR_AI_API_KEY ?? "").trim();
  if (vinKey !== "") {
    const baseUrl = (env.VIN_OCR_AI_BASE_URL ?? "").trim().replace(/\/$/, "");
    return {
      provider: "openai-compatible",
      baseUrl: baseUrl === "" ? OPENAI_BASE_URL : baseUrl,
      apiKey: vinKey,
      model: modelOverride === "" ? OPENAI_DEFAULT_MODEL : modelOverride,
    };
  }

  return null;
}

/**
 * Plan a Scan Receipt request (the photo arrives inline from the
 * client, unlike intake documents which are already in storage).
 * Receipts are images or PDFs; anything else is rejected here.
 */
export function planReceiptParseRequest(input: unknown): ReceiptParseRequestPlan {
  if (!isRecord(input)) {
    return { request: null, error: "Send the receipt as an object." };
  }
  const raw = input.image_base64;
  if (typeof raw !== "string" || raw.trim() === "") {
    return { request: null, error: "A receipt photo (image_base64) is required." };
  }
  // Tolerate a full data URI; the provider call rebuilds it anyway.
  const imageBase64 = raw.includes(",") ? raw.slice(raw.indexOf(",") + 1) : raw;
  if (imageBase64.length > MAX_IMAGE_BASE64_CHARS) {
    return { request: null, error: "That file is too large to read — retake the photo closer." };
  }
  let mimeType = "image/jpeg";
  const rawMime = input.mime_type;
  if (rawMime !== undefined && rawMime !== null && rawMime !== "") {
    if (
      typeof rawMime !== "string" ||
      !(rawMime.startsWith("image/") || rawMime === "application/pdf") ||
      rawMime.length > 120
    ) {
      return { request: null, error: "The receipt must be an image or a PDF." };
    }
    mimeType = rawMime;
  }
  return { request: { imageBase64, mimeType }, error: null };
}

const EXTRACTION_FIELDS =
  "vendor_name, transaction_date (YYYY-MM-DD), subtotal, tax_amount, total_amount, " +
  "payment_method (card, cash, check, ach, or other), last4, reference_number (invoice/receipt number), " +
  "line_items (array of {description, quantity, unit_price, line_total}), suggested_category, " +
  "fuel receipts also: gallons, price_per_gallon, odometer, fuel_type, station_name, station_location; " +
  "service invoices also: vin, mileage, license_plate, vehicle_year, vehicle_make, vehicle_model, " +
  "oil_type, oil_spec, labor_total, parts_total";

export function receiptExtractionInstruction(profile: string): string {
  return (
    `You extract structured data from ${profile} expense receipts and invoices. ` +
    `Return ONLY a JSON object with these fields where present: ${EXTRACTION_FIELDS}, ` +
    `plus "confidence" (0 to 1, your overall extraction confidence). ` +
    `Dates as YYYY-MM-DD. Numbers as numbers. Omit fields you cannot find; never invent values. ` +
    `If a line on the document is crossed out or voided, exclude it.`
  );
}

export interface ReceiptParseCallInput {
  profile: string;
  mimeType: string;
  /** Base64 document bytes (image / PDF / audio for Gemini). */
  base64?: string;
  /** Decoded text for text/* documents — sent instead of bytes. */
  text?: string;
}

/** The provider call, ready for fetch, in the configured provider's own wire shape. */
export function buildReceiptParseProviderCall(
  config: ReceiptParseConfig,
  input: ReceiptParseCallInput
): { url: string; init: { method: string; headers: Record<string, string>; body: string } } {
  const instruction = receiptExtractionInstruction(input.profile);

  if (config.provider === "gemini") {
    const parts: Array<Record<string, unknown>> = [{ text: `${instruction}\n\nExtract the expense data from this document.` }];
    if (typeof input.text === "string") {
      parts.push({ text: input.text.slice(0, 24000) });
    } else {
      parts.push({ inline_data: { mime_type: input.mimeType, data: input.base64 ?? "" } });
    }
    return {
      url: `${config.baseUrl}/models/${config.model}:generateContent`,
      init: {
        method: "POST",
        headers: {
          "x-goog-api-key": config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { response_mime_type: "application/json" },
        }),
      },
    };
  }

  const userContent: Array<Record<string, unknown>> =
    typeof input.text === "string"
      ? [{ type: "text", text: input.text.slice(0, 24000) }]
      : [
          { type: "text", text: "Extract the expense data from this document." },
          input.mimeType === "application/pdf"
            ? {
                type: "file",
                file: {
                  filename: "receipt.pdf",
                  file_data: `data:${input.mimeType};base64,${input.base64 ?? ""}`,
                },
              }
            : {
                type: "image_url",
                image_url: { url: `data:${input.mimeType};base64,${input.base64 ?? ""}` },
              },
        ];
  return {
    url: `${config.baseUrl}/chat/completions`,
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: instruction },
          { role: "user", content: userContent },
        ],
      }),
    },
  };
}

/** The model's answer text, whichever provider answered. */
export function receiptProviderAnswerText(
  provider: ReceiptParseProvider,
  body: unknown
): string | null {
  if (!isRecord(body)) return null;
  if (provider === "gemini") {
    const candidates = body.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0) return null;
    const first: unknown = candidates[0];
    if (!isRecord(first) || !isRecord(first.content)) return null;
    const parts = first.content.parts;
    if (!Array.isArray(parts)) return null;
    const texts = parts
      .map((p: unknown) => (isRecord(p) && typeof p.text === "string" ? p.text : ""))
      .filter((t: string) => t !== "");
    return texts.length > 0 ? texts.join("") : null;
  }
  const choices = body.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first: unknown = choices[0];
  if (!isRecord(first) || !isRecord(first.message)) return null;
  const content = first.message.content;
  return typeof content === "string" && content.trim() !== "" ? content : null;
}

// ---------------------------------------------------------------------------
// Normalization — the model's JSON becomes the stored extraction, or
// null when nothing usable was read (the caller records an honest
// failure; an empty "success" is never stored).
// ---------------------------------------------------------------------------

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function cleanMoney(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null;
  }
  if (typeof value === "string") {
    const stripped = value.replace(/[$,\s]/g, "");
    if (stripped === "") return null;
    const n = Number(stripped);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
  }
  return null;
}

function cleanCount(value: unknown): number | null {
  const n = cleanMoney(value);
  return n === null ? null : Math.round(n);
}

function cleanDate(value: unknown): string | null {
  const raw = cleanString(value);
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const us = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  let year: number, month: number, day: number;
  if (iso) {
    [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (us) {
    [month, day, year] = [Number(us[1]), Number(us[2]), Number(us[3])];
  } else {
    return null;
  }
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

const PAYMENT_METHODS = new Set(["card", "cash", "check", "ach", "other"]);
function cleanPaymentMethod(value: unknown): string | null {
  const raw = cleanString(value);
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (PAYMENT_METHODS.has(lower)) return lower;
  if (/credit|debit/.test(lower)) return "card";
  if (/cash/.test(lower)) return "cash";
  if (/check|cheque/.test(lower)) return "check";
  if (/ach|transfer|wire/.test(lower)) return "ach";
  return null;
}

function cleanLast4(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const digits = String(value).replace(/\D/g, "");
  return digits.length === 4 ? digits : null;
}

function cleanLineItems(value: unknown): ReceiptLineItem[] {
  if (!Array.isArray(value)) return [];
  const items: ReceiptLineItem[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const description = cleanString(entry.description) ?? "";
    const quantity = cleanMoney(entry.quantity) ?? 1;
    const unit_price = cleanMoney(entry.unit_price) ?? 0;
    const line_total = cleanMoney(entry.line_total) ?? Math.round(quantity * unit_price * 100) / 100;
    if (description === "" && line_total === 0) continue;
    items.push({ description, quantity, unit_price, line_total });
  }
  return items;
}

/**
 * Parse + normalize the model's answer. Returns null when the answer
 * is not JSON, or when nothing usable was read (no vendor, no date,
 * no amounts, no line items) — an unreadable receipt must surface as
 * a failure the user can retry, never as a stored empty parse.
 */
export function normalizeReceiptExtraction(answerText: string | null): ReceiptExtraction | null {
  if (!answerText) return null;
  const unfenced = answerText.replace(/```(?:json)?/gi, "").trim();
  let raw: unknown;
  try {
    raw = JSON.parse(unfenced);
  } catch {
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      raw = JSON.parse(unfenced.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  if (!isRecord(raw)) return null;

  const rawConfidence = Number(raw.confidence);
  const confidence = Number.isFinite(rawConfidence)
    ? Math.min(1, Math.max(0, rawConfidence))
    : 0.5;

  const rawVin = cleanString(raw.vin);
  const extraction: ReceiptExtraction = {
    vendor_name: cleanString(raw.vendor_name),
    transaction_date: cleanDate(raw.transaction_date),
    subtotal: cleanMoney(raw.subtotal),
    tax_amount: cleanMoney(raw.tax_amount),
    total_amount: cleanMoney(raw.total_amount),
    payment_method: cleanPaymentMethod(raw.payment_method),
    last4: cleanLast4(raw.last4),
    reference_number:
      raw.reference_number === null || raw.reference_number === undefined
        ? null
        : cleanString(String(raw.reference_number)),
    line_items: cleanLineItems(raw.line_items),
    suggested_category: cleanString(raw.suggested_category),
    gallons: cleanMoney(raw.gallons),
    price_per_gallon: cleanMoney(raw.price_per_gallon),
    odometer: cleanCount(raw.odometer),
    fuel_type: cleanString(raw.fuel_type),
    station_name: cleanString(raw.station_name),
    station_location: cleanString(raw.station_location),
    vin: rawVin ? rawVin.toUpperCase().replace(/[^A-Z0-9]/g, "") : null,
    mileage: cleanCount(raw.mileage),
    license_plate: cleanString(raw.license_plate),
    vehicle_year: (() => {
      const y = cleanCount(raw.vehicle_year);
      return y !== null && y >= 1900 && y <= 2100 ? y : null;
    })(),
    vehicle_make: cleanString(raw.vehicle_make),
    vehicle_model: cleanString(raw.vehicle_model),
    oil_type: cleanString(raw.oil_type),
    oil_spec: cleanString(raw.oil_spec),
    labor_total: cleanMoney(raw.labor_total),
    parts_total: cleanMoney(raw.parts_total),
    confidence,
  };

  if (!isReceiptExtractionUsable(extraction)) return null;
  return extraction;
}

/** A read is usable when it carries at least one anchor field. */
export function isReceiptExtractionUsable(extraction: ReceiptExtraction): boolean {
  return (
    extraction.vendor_name !== null ||
    extraction.station_name !== null ||
    extraction.transaction_date !== null ||
    extraction.total_amount !== null ||
    extraction.subtotal !== null ||
    extraction.line_items.length > 0
  );
}

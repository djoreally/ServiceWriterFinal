/**
 * tech-app-vin-ocr.command — pure planning for the tech app's VIN
 * photo decode (POST /v1/tech-app/jobs/:appointmentId/vin-ocr).
 *
 * Ty's ask (2026-11-12): where a VIN is stamped numbers with no
 * barcode, the tech takes a photo and the app reads the characters
 * — typing all 17 digits is the last resort. This module owns the
 * request rules, the provider configuration, and the provider
 * answer parsing; the route handler owns auth, the assignment
 * scope, and the provider call itself.
 *
 * PROVIDER CONFIGURATION IS ENV-DRIVEN. The primary key is the
 * one being provisioned for this project (Ty, 2026-11-12):
 *
 *   GEMINI_API_KEY   the Gemini API key in the Service Writer
 *                    server environment. Without it the door
 *                    answers integrationUnavailable and the app
 *                    falls back to "type the VIN in".
 *   VIN_OCR_MODEL    optional model override for whichever
 *                    provider is configured (Gemini default:
 *                    gemini-2.5-flash, a vision model).
 *
 * A generic fallback follows the pattern supabase/functions/
 * expense-document-parse uses for its EXPENSE_PARSE_AI_* secrets:
 * if GEMINI_API_KEY is absent but VIN_OCR_AI_API_KEY is set, the
 * door calls that OpenAI-compatible chat-completions endpoint
 * (VIN_OCR_AI_BASE_URL, default https://api.openai.com/v1)
 * instead. No key is ever hardcoded or shipped to the client.
 *
 * The door is decode-only: it stores nothing (no photo, no VIN).
 * Whatever it reads comes back to the phone, where the tech
 * confirms or corrects it in the VIN field; the only write path
 * stays PATCH /v1/tech-app/jobs/:appointmentId/vehicle.
 */

export type VinOcrProvider = "gemini" | "openai-compatible";

export interface VinOcrConfig {
  provider: VinOcrProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface VinOcrImage {
  imageBase64: string;
  mimeType: string;
}

/** Exactly one of request / error is non-null (house plan shape). */
export interface VinOcrRequestPlan {
  request: VinOcrImage | null;
  error: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** ~9 MB of image once decoded — a phone photo, not an archive. */
const MAX_IMAGE_BASE64_CHARS = 12_000_000;

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_DEFAULT_MODEL = "gemini-2.5-flash";
const OPENAI_BASE_URL = "https://api.openai.com/v1";
const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";

export function readVinOcrConfig(
  env: Record<string, string | undefined>
): VinOcrConfig | null {
  const modelOverride = (env.VIN_OCR_MODEL ?? "").trim();

  const geminiKey = (env.GEMINI_API_KEY ?? "").trim();
  if (geminiKey !== "") {
    return {
      provider: "gemini",
      baseUrl: GEMINI_BASE_URL,
      apiKey: geminiKey,
      model: modelOverride === "" ? GEMINI_DEFAULT_MODEL : modelOverride,
    };
  }

  const aiKey = (env.VIN_OCR_AI_API_KEY ?? "").trim();
  if (aiKey !== "") {
    const baseUrl = (env.VIN_OCR_AI_BASE_URL ?? "").trim().replace(/\/$/, "");
    return {
      provider: "openai-compatible",
      baseUrl: baseUrl === "" ? OPENAI_BASE_URL : baseUrl,
      apiKey: aiKey,
      model: modelOverride === "" ? OPENAI_DEFAULT_MODEL : modelOverride,
    };
  }

  return null;
}

export function planVinOcrRequest(input: unknown): VinOcrRequestPlan {
  if (!isRecord(input)) {
    return { request: null, error: "Send the photo as an object." };
  }
  const raw = input.image_base64;
  if (typeof raw !== "string" || raw.trim() === "") {
    return { request: null, error: "A photo (image_base64) is required." };
  }
  // Tolerate a full data URI; the provider call rebuilds it anyway.
  const imageBase64 = raw.includes(",") ? raw.slice(raw.indexOf(",") + 1) : raw;
  if (imageBase64.length > MAX_IMAGE_BASE64_CHARS) {
    return { request: null, error: "That photo is too large to read — retake it closer." };
  }
  let mimeType = "image/jpeg";
  const rawMime = input.mime_type;
  if (rawMime !== undefined && rawMime !== null && rawMime !== "") {
    if (typeof rawMime !== "string" || !rawMime.startsWith("image/") || rawMime.length > 120) {
      return { request: null, error: "The photo must be an image." };
    }
    mimeType = rawMime;
  }
  return { request: { imageBase64, mimeType }, error: null };
}

const VIN_INSTRUCTION =
  "You read vehicle identification numbers (VINs) from photos of VIN plates, door-jamb stickers, and dashboard plates. " +
  'Return ONLY a JSON object: {"vin": "THE17CHARACTERS"} with the characters exactly as shown, or {"vin": null} if no VIN is legible. ' +
  "Never invent or guess characters.";

/** The provider call, ready for fetch, in the configured
 *  provider's own wire shape. */
export function buildVinOcrProviderCall(
  config: VinOcrConfig,
  image: VinOcrImage
): { url: string; init: { method: string; headers: Record<string, string>; body: string } } {
  if (config.provider === "gemini") {
    return {
      url: `${config.baseUrl}/models/${config.model}:generateContent`,
      init: {
        method: "POST",
        headers: {
          "x-goog-api-key": config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: `${VIN_INSTRUCTION}\n\nRead the VIN in this photo.` },
                { inline_data: { mime_type: image.mimeType, data: image.imageBase64 } },
              ],
            },
          ],
          generationConfig: { response_mime_type: "application/json" },
        }),
      },
    };
  }
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
          { role: "system", content: VIN_INSTRUCTION },
          {
            role: "user",
            content: [
              { type: "text", text: "Read the VIN in this photo." },
              {
                type: "image_url",
                image_url: { url: `data:${image.mimeType};base64,${image.imageBase64}` },
              },
            ],
          },
        ],
      }),
    },
  };
}

/** Uppercase, letters/digits only — the shape both the field and
 *  the save door normalize to. */
export function normalizeVinText(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** The model's answer text, whichever provider answered. */
function providerAnswerText(provider: VinOcrProvider, body: unknown): string | null {
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

/**
 * The provider's answer → the VIN it read, or null when it read
 * none. A JSON {"vin": "..."} answer is taken as-is (normalized)
 * so a near-miss read still reaches the tech as something to
 * correct; a non-JSON answer is scanned for a clean 17-character
 * run. Anything else is null — never a guess.
 */
export function parseVinOcrProviderResponse(
  provider: VinOcrProvider,
  body: unknown
): { vin: string | null } {
  const content = providerAnswerText(provider, body);
  if (content === null) return { vin: null };

  try {
    const parsed: unknown = JSON.parse(content);
    if (isRecord(parsed)) {
      const vin = parsed.vin;
      if (typeof vin === "string") {
        const normalized = normalizeVinText(vin);
        return { vin: normalized === "" ? null : normalized };
      }
      return { vin: null };
    }
  } catch {
    // Not JSON — fall through to the token scan.
  }
  // A clean 17-character token standing on its own in the text…
  const token = content.toUpperCase().match(/[A-Z0-9]{17}/);
  if (token) return { vin: token[0] };
  // …or the whole answer being one spaced/dashed-out VIN.
  const whole = normalizeVinText(content);
  return { vin: whole.length === 17 ? whole : null };
}

/**
 * receipt-parse.service — the Sovereign Ledger receipt reader,
 * server side (Document Intake parse + Scan Receipt).
 *
 * The reader runs in-process in the Hono server. It replaced two
 * dead Supabase Edge Function doors (see the diagnosis in
 * src/application/commands/receipt-parse.command.ts):
 *  - Intake re-parse invoked `expense-document-parse`, never
 *    deployed, and off-vocabulary even if it had been.
 *  - Scan Receipt proxied to `expense-receipt-ocr`, which never
 *    existed anywhere in the repo.
 *
 * Honest failure semantics (the no-poisoning rule): a failed parse
 * writes ONLY { parse_status: "parse_failed", parse_error } to the
 * document row. parsed_json is never written on failure, so a bad
 * read can never masquerade as a successful empty extraction, and
 * the document stays re-parseable. A successful parse writes the
 * full extraction in the app's own vocabulary
 * (pending | parsing | parsed | parse_failed). When the provider
 * answers non-2xx, its error body is captured (truncated,
 * credential-redacted) into parse_error and the service log — the
 * first production run of this reader failed every receipt with a
 * bare HTTP 404 precisely because the original service discarded
 * the body and left nothing to diagnose.
 *
 * Provider access is env-driven via readReceiptParseConfig
 * (GEMINI_API_KEY first — the key already provisioned in the server
 * environment for the VIN decode door). With no key configured the
 * intake row records the configuration reason and the scan door
 * throws ReceiptParseNotConfiguredError; no credential is invented.
 */
import {
  buildReceiptParseProviderCall,
  normalizeReceiptExtraction,
  readReceiptParseConfig,
  receiptProviderAnswerText,
  type ReceiptExtraction,
  type ReceiptParseConfig,
  type ReceiptParseImage,
} from "@/application/commands/receipt-parse.command";
import { normalizeVin, validateVin } from "@/server/hono/lib/creation-validation";

const INTAKE_BUCKET = "document-intake";
const PROVIDER_TIMEOUT_MS = 45_000;

export const RECEIPT_PARSE_NOT_CONFIGURED_REASON =
  "Receipt reading is not configured on this server (no vision provider key is set).";

/** Thrown by the scan door when no provider key is configured. */
export class ReceiptParseNotConfiguredError extends Error {
  constructor() {
    super(RECEIPT_PARSE_NOT_CONFIGURED_REASON);
    this.name = "ReceiptParseNotConfiguredError";
  }
}

/** Thrown by the scan door when the provider call or read fails. */
export class ReceiptParseProviderError extends Error {
  /**
   * The provider's own error-body excerpt (truncated, credential-free)
   * when the provider answered a non-2xx. The message itself stays
   * short and user-honest; the detail exists so the recorded
   * parse_error and the service log state the provider's actual
   * reason instead of a bare status code.
   */
  providerDetail?: string;

  constructor(reason: string, providerDetail?: string) {
    super(reason);
    this.name = "ReceiptParseProviderError";
    if (providerDetail) this.providerDetail = providerDetail;
  }
}

/**
 * The parse_error recorded on an intake row for a provider error:
 * the short user-honest message PLUS the provider's verbatim
 * excerpt when one was captured, so a failed parse can be diagnosed
 * from the row alone (the pre-fix reader discarded the body, which
 * is why the 2026-11-13 production 404s carried no reason).
 */
export function recordedProviderFailureReason(error: ReceiptParseProviderError): string {
  return error.providerDetail
    ? `${error.message} Provider said: ${error.providerDetail}`
    : error.message;
}

/**
 * The slice of the request-scoped Supabase client this service uses.
 * Kept structural (the routers pass their `any`-cast clients) so the
 * service stays unit-testable with a hand-rolled fake.
 */
export type ReceiptParseSupabase = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface ReceiptParseDeps {
  supabase: ReceiptParseSupabase;
  env?: Record<string, string | undefined>;
  fetchFn?: typeof fetch;
}

export interface IntakeDocumentForParse {
  id: string;
  user_id: string;
  file_path: string;
  mime_type: string;
  profile: string;
}

export type IntakeParseOutcome =
  | {
      ok: true;
      extraction: ReceiptExtraction;
      confidence: number;
      vin: string | null;
      vinValid: boolean;
      fleetVehicleId: string | null;
      method: string;
    }
  | { ok: false; reason: string };

export type IntakeParseFailure = Extract<IntakeParseOutcome, { ok: false }>;

/**
 * Type guard for the failure branch. Callers narrow through this
 * rather than `!outcome.ok` because the app tsconfig compiles with
 * strict mode off, where truthiness narrowing of a boolean-literal
 * discriminant does not apply (verified against tsc 5.9).
 */
export function isIntakeParseFailure(
  outcome: IntakeParseOutcome
): outcome is IntakeParseFailure {
  return outcome.ok === false;
}

interface ProviderRead {
  extraction: ReceiptExtraction;
  answerText: string;
}

/** Longest provider error-body excerpt kept for parse_error / logs. */
const PROVIDER_ERROR_EXCERPT_CHARS = 400;

/**
 * Read a non-2xx provider answer's body as a short, secret-free
 * excerpt. The provider's stated reason (Google's error.message, a
 * proxy's complaint, …) is the difference between a diagnosable
 * failure and a bare status code, so it is ALWAYS captured when the
 * provider sends one. The configured key is redacted defensively —
 * a provider error body should never echo it, but the excerpt lands
 * in a database row and a log, and neither may ever hold a secret.
 */
async function providerErrorExcerpt(
  res: { text?: unknown; json?: unknown },
  apiKey: string
): Promise<string | undefined> {
  let raw = "";
  try {
    if (typeof res.text === "function") {
      raw = await (res.text as () => Promise<string>)();
    } else if (typeof res.json === "function") {
      const parsed: unknown = await (res.json as () => Promise<unknown>)().catch(
        () => null
      );
      if (parsed !== null && parsed !== undefined) raw = JSON.stringify(parsed);
    }
  } catch {
    raw = "";
  }
  let excerpt = raw.replace(/\s+/g, " ").trim();
  if (apiKey !== "") excerpt = excerpt.split(apiKey).join("[redacted]");
  if (excerpt === "") return undefined;
  if (excerpt.length > PROVIDER_ERROR_EXCERPT_CHARS) {
    excerpt = `${excerpt.slice(0, PROVIDER_ERROR_EXCERPT_CHARS)}…`;
  }
  return excerpt;
}

/**
 * One provider round-trip: build the call in the provider's wire
 * shape, fetch with a hard timeout, and normalize the answer.
 * Throws ReceiptParseProviderError with a user-honest reason on any
 * failure — transport, HTTP status, or an unreadable answer.
 */
async function callReceiptProvider(
  deps: ReceiptParseDeps,
  config: ReceiptParseConfig,
  input: { profile: string; mimeType: string; base64?: string; text?: string }
): Promise<ProviderRead> {
  const fetchFn = deps.fetchFn ?? fetch;
  const call = buildReceiptParseProviderCall(config, input);
  let body: unknown = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
    try {
      const res = await fetchFn(call.url, { ...call.init, signal: controller.signal });
      if (!res.ok) {
        const detail = await providerErrorExcerpt(res, config.apiKey);
        console.error(
          `[receipt-parse] provider answered HTTP ${res.status} for ${config.provider}:${config.model}: ${detail ?? "(no error body)"}`
        );
        throw new ReceiptParseProviderError(
          `The receipt reader's provider answered HTTP ${res.status} — try again in a moment.`,
          detail
        );
      }
      body = await res.json().catch(() => null);
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    if (e instanceof ReceiptParseProviderError) throw e;
    throw new ReceiptParseProviderError(
      "The receipt reader didn't answer — check the photo and try again."
    );
  }
  const answerText = receiptProviderAnswerText(config.provider, body);
  const extraction = normalizeReceiptExtraction(answerText);
  if (!extraction) {
    throw new ReceiptParseProviderError(
      "Nothing readable could be extracted from this document — try a clearer, closer photo."
    );
  }
  return { extraction, answerText: answerText ?? "" };
}

/**
 * Failure write for an intake document: status + reason ONLY.
 * parsed_json / confidence / extracted fields are deliberately left
 * untouched so a failure never overwrites or impersonates a read.
 */
async function recordIntakeParseFailure(
  deps: ReceiptParseDeps,
  doc: IntakeDocumentForParse,
  reason: string
): Promise<void> {
  await deps.supabase
    .from("document_intake")
    .update({ parse_status: "parse_failed", parse_error: reason })
    .eq("id", doc.id)
    .eq("user_id", doc.user_id);
}

/**
 * Blob → bytes/text with a fallback: some Blob implementations
 * (jsdom's, which the router test harness's storage mock returns)
 * lack arrayBuffer()/text(); Response consumes any Blob body.
 * Production's undici Blob takes the direct path.
 */
async function blobBytes(blob: Blob): Promise<Buffer> {
  if (typeof blob.arrayBuffer === "function") {
    return Buffer.from(await blob.arrayBuffer());
  }
  return Buffer.from(await new Response(blob).arrayBuffer());
}

async function blobText(blob: Blob): Promise<string> {
  if (typeof blob.text === "function") return blob.text();
  return (await blobBytes(blob)).toString("utf8");
}

/** Uploads without a usable type default to the photo case. */
function resolveDocumentMime(mimeType: string): string {
  if (
    mimeType.startsWith("image/") ||
    mimeType === "application/pdf" ||
    mimeType.startsWith("text/")
  ) {
    return mimeType;
  }
  return "image/jpeg";
}

/**
 * Parse one stored intake document end to end: mark parsing,
 * download the file from the intake bucket, read it with the
 * configured provider, validate/link any VIN, and store the
 * extraction. Every failure path records parse_failed + reason on
 * the row and returns { ok: false } — the document stays
 * re-parseable and no partial result is ever stored.
 */
export async function runIntakeDocumentParse(
  deps: ReceiptParseDeps,
  doc: IntakeDocumentForParse
): Promise<IntakeParseOutcome> {
  const env = deps.env ?? process.env;
  const config = readReceiptParseConfig(env);
  if (!config) {
    await recordIntakeParseFailure(deps, doc, RECEIPT_PARSE_NOT_CONFIGURED_REASON);
    return { ok: false, reason: RECEIPT_PARSE_NOT_CONFIGURED_REASON };
  }

  await deps.supabase
    .from("document_intake")
    .update({ parse_status: "parsing", parse_error: null })
    .eq("id", doc.id)
    .eq("user_id", doc.user_id);

  const fail = async (reason: string): Promise<IntakeParseOutcome> => {
    await recordIntakeParseFailure(deps, doc, reason);
    return { ok: false, reason };
  };

  const { data: blob, error: downloadError } = await deps.supabase.storage
    .from(INTAKE_BUCKET)
    .download(doc.file_path);
  if (downloadError || !blob) {
    return fail("The stored receipt file could not be read — re-upload it and try again.");
  }

  const mimeType = resolveDocumentMime(doc.mime_type || "");
  let read: ProviderRead;
  try {
    if (mimeType.startsWith("text/")) {
      const text = await blobText(blob as Blob);
      read = await callReceiptProvider(deps, config, { profile: doc.profile, mimeType, text });
    } else {
      const bytes = await blobBytes(blob as Blob);
      read = await callReceiptProvider(deps, config, {
        profile: doc.profile,
        mimeType,
        base64: bytes.toString("base64"),
      });
    }
  } catch (e) {
    if (e instanceof ReceiptParseProviderError) {
      // Record the provider's own excerpt alongside the short reason —
      // the row must state WHY the provider refused, not just that it did.
      return fail(recordedProviderFailureReason(e));
    }
    return fail(e instanceof Error ? e.message : "The receipt could not be read.");
  }

  const { extraction, answerText } = read;

  // VIN leg (service invoices): the extracted VIN is normalized and
  // validated with the platform's own rules, then linked to the
  // fleet vehicle that carries it — never guessed.
  let extractedVin: string | null = null;
  let vinValid = false;
  let fleetVehicleId: string | null = null;
  if (extraction.vin) {
    extractedVin = normalizeVin(extraction.vin);
    vinValid = validateVin(extractedVin) === null;
    if (vinValid) {
      const { data: vehicle } = await deps.supabase
        .from("fleet_vehicles")
        .select("id")
        .eq("user_id", doc.user_id)
        .eq("vin", extractedVin)
        .maybeSingle();
      fleetVehicleId = (vehicle as { id?: string } | null)?.id ?? null;
    }
  }

  const method = `${config.provider}:${config.model}`;
  const { error: updateError } = await deps.supabase
    .from("document_intake")
    .update({
      parse_status: "parsed",
      parsed_json: extraction,
      confidence: extraction.confidence,
      parse_method: method,
      parse_error: null,
      raw_text: answerText,
      extracted_vin: extractedVin,
      vin_valid: vinValid,
      fleet_vehicle_id: fleetVehicleId,
    })
    .eq("id", doc.id)
    .eq("user_id", doc.user_id);
  if (updateError) {
    return fail("The read succeeded but could not be saved — try parsing again.");
  }

  return {
    ok: true,
    extraction,
    confidence: extraction.confidence,
    vin: extractedVin,
    vinValid,
    fleetVehicleId,
    method,
  };
}

/**
 * Scan Receipt door: the photo arrives inline from the client and
 * nothing is stored — the extraction goes straight back so the
 * dialog can prefill the expense form. Throws
 * ReceiptParseNotConfiguredError (→ 503) or ReceiptParseProviderError
 * (→ 502) so the route can answer honestly.
 */
export async function runReceiptScan(
  deps: ReceiptParseDeps,
  image: ReceiptParseImage
): Promise<ReceiptExtraction> {
  const env = deps.env ?? process.env;
  const config = readReceiptParseConfig(env);
  if (!config) throw new ReceiptParseNotConfiguredError();
  const { extraction } = await callReceiptProvider(deps, config, {
    profile: "general",
    mimeType: image.mimeType,
    base64: image.imageBase64,
  });
  return extraction;
}

export interface ResolvedScanCategory {
  id: string | null;
  name: string | null;
  source: "learned" | "ai_suggested" | "unmatched";
}

/**
 * Category resolution for a scan, mirroring the approve flow's
 * vendor learning: the vendor matcher RPC carries the category the
 * shop taught it (learned); failing that, the model's suggested
 * category name is matched against the shop's own expense
 * categories (ai_suggested). Best-effort — a resolution failure
 * never fails the scan itself.
 */
export async function resolveReceiptScanCategory(
  deps: ReceiptParseDeps,
  userId: string,
  extraction: ReceiptExtraction
): Promise<ResolvedScanCategory> {
  const unmatched: ResolvedScanCategory = {
    id: null,
    name: extraction.suggested_category,
    source: "unmatched",
  };
  try {
    if (extraction.vendor_name) {
      const { data: matches } = await deps.supabase.rpc("match_vendor_by_name", {
        p_user_id: userId,
        p_raw_name: extraction.vendor_name,
      });
      const match = Array.isArray(matches) ? matches[0] : null;
      const categoryId = (match as { default_category_id?: string | null } | null)
        ?.default_category_id;
      if (match && categoryId) {
        const { data: category } = await deps.supabase
          .from("expense_categories")
          .select("id, name")
          .eq("id", categoryId)
          .maybeSingle();
        if (category) {
          return {
            id: (category as { id: string }).id,
            name: (category as { name: string | null }).name ?? null,
            source: "learned",
          };
        }
        return { id: categoryId, name: null, source: "learned" };
      }
    }
    if (extraction.suggested_category) {
      const { data: category } = await deps.supabase
        .from("expense_categories")
        .select("id, name")
        .eq("user_id", userId)
        .ilike("name", extraction.suggested_category)
        .maybeSingle();
      if (category) {
        return {
          id: (category as { id: string }).id,
          name: (category as { name: string | null }).name ?? extraction.suggested_category,
          source: "ai_suggested",
        };
      }
    }
  } catch {
    return unmatched;
  }
  return unmatched;
}

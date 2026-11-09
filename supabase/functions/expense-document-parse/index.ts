// expense-document-parse — turns an uploaded expense document into the
// structured parsed_json the Document Intake approve flow consumes.
//
// This function is the missing half of a call that already exists:
// src/server/hono/routes/documents.ts invokes
//   supabase.functions.invoke("expense-document-parse", { body: { documentId } })
// and until now the function was not deployed (404 in production).
//
// Pipeline (self-contained: NO storage download URL, NO webhook callback,
// NO external job id — the document row itself is the job record):
//   1. Authenticate the call, one of two ways:
//      a. Job-scoped token (header `x-job-token`): HMAC-SHA256 signed,
//         minted by trusted server code for THIS document only
//         (src/server/agent-api/job-token.ts), verified here with the
//         same purpose-prefixed secret derivation the repo already uses
//         for signed state in google-calendar-sync.
//      b. Caller JWT (the documents router's functions.invoke path):
//         the caller's own session; the document must belong to them.
//   2. Download the file from the private `document-intake` bucket
//      inside this function (service role on the job-token path).
//   3. Transcribe audio with an OpenAI-compatible Whisper endpoint
//      (multipart formData, verbose_json, word + segment timestamps),
//      then structure the result — or structure the document directly
//      for image / PDF / text uploads.
//   4. Update document_intake in place: parse_status, parsed_json,
//      confidence. That row update is the only "callback".
//
// Provider configuration (function secrets):
//   EXPENSE_PARSE_AI_BASE_URL   default https://api.openai.com/v1
//   EXPENSE_PARSE_AI_API_KEY    required for transcription/structuring
//   EXPENSE_PARSE_WHISPER_MODEL default whisper-1
//   EXPENSE_PARSE_STRUCTURE_MODEL default gpt-4o-mini
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const AI_BASE_URL = (Deno.env.get("EXPENSE_PARSE_AI_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/$/, "");
const AI_API_KEY = Deno.env.get("EXPENSE_PARSE_AI_API_KEY") ?? "";
const WHISPER_MODEL = Deno.env.get("EXPENSE_PARSE_WHISPER_MODEL") ?? "whisper-1";
const STRUCTURE_MODEL = Deno.env.get("EXPENSE_PARSE_STRUCTURE_MODEL") ?? "gpt-4o-mini";
const BUCKET = "document-intake";
const JOB_SCOPE = "expense-document-parse";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-job-token",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...cors } });

// ---------------------------------------------------------------------------
// Job token verification (mirror of src/server/agent-api/job-token.ts)
// ---------------------------------------------------------------------------

function b64urlDecode(value: string): string {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
  return atob(normalized);
}

async function verifyJobToken(token: string, expectedDocumentId: string): Promise<{ sub: string }> {
  const secret = `expense-parse-job:${SUPABASE_SERVICE_ROLE_KEY}`;
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Server is not configured for job tokens");
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) throw new Error("Malformed job token");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expectedSig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)))))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  if (signature !== expectedSig) throw new Error("Invalid job token signature");
  const claims = JSON.parse(b64urlDecode(payload)) as { doc: string; sub: string; scope: string; exp: number };
  if (claims.scope !== JOB_SCOPE) throw new Error("Job token scope mismatch");
  if (claims.doc !== expectedDocumentId) throw new Error("Job token document mismatch");
  if (typeof claims.exp !== "number" || claims.exp <= Date.now()) throw new Error("Job token expired");
  return { sub: claims.sub };
}

// ---------------------------------------------------------------------------
// AI calls
// ---------------------------------------------------------------------------

async function transcribeAudio(bytes: Uint8Array, fileName: string, mimeType: string): Promise<{ text: string }> {
  const form = new FormData();
  form.append("file", new Blob([bytes.buffer as ArrayBuffer], { type: mimeType || "audio/mpeg" }), fileName);
  form.append("model", WHISPER_MODEL);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  form.append("timestamp_granularities[]", "segment");
  const res = await fetch(`${AI_BASE_URL}/audio/transcriptions`, {
    method: "POST",
    headers: { authorization: `Bearer ${AI_API_KEY}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Transcription failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { text?: string };
  if (!data.text) throw new Error("Transcription returned no text");
  return { text: data.text };
}

const EXTRACTION_FIELDS = [
  "vendor_name", "transaction_date", "subtotal", "tax_amount", "total_amount",
  "payment_method", "last4", "reference_number",
  "line_items (array of {description, quantity, unit_price, line_total})",
  "fuel receipts also: gallons, price_per_gallon, odometer, fuel_type, station_name, station_location",
  "service invoices also: vin, mileage, oil_type, oil_spec",
].join(", ");

async function structureFromText(profile: string, text: string): Promise<{ parsed: Record<string, unknown>; confidence: number }> {
  const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${AI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: STRUCTURE_MODEL,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            `You extract structured data from ${profile} expense documents. Return ONLY a JSON object with these fields where present: ${EXTRACTION_FIELDS}, plus "confidence" (0 to 1, your overall extraction confidence). Dates as YYYY-MM-DD. Numbers as numbers. Omit fields you cannot find; never invent values.`,
        },
        { role: "user", content: text.slice(0, 24000) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Structuring failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Structuring returned no content");
  return splitConfidence(JSON.parse(content) as Record<string, unknown>);
}

async function structureFromFile(
  profile: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<{ parsed: Record<string, unknown>; confidence: number }> {
  const base64 = btoa(String.fromCharCode(...bytes));
  const dataUri = `data:${mimeType};base64,${base64}`;
  const filePart = mimeType === "application/pdf"
    ? { type: "file", file: { filename: "document.pdf", file_data: dataUri } }
    : { type: "image_url", image_url: { url: dataUri } };
  const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${AI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: STRUCTURE_MODEL,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            `You extract structured data from ${profile} expense documents. Return ONLY a JSON object with these fields where present: ${EXTRACTION_FIELDS}, plus "confidence" (0 to 1, your overall extraction confidence). Dates as YYYY-MM-DD. Numbers as numbers. Omit fields you cannot find; never invent values.`,
        },
        { role: "user", content: [{ type: "text", text: "Extract the expense data from this document." }, filePart] },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Structuring failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Structuring returned no content");
  return splitConfidence(JSON.parse(content) as Record<string, unknown>);
}

function splitConfidence(parsed: Record<string, unknown>): { parsed: Record<string, unknown>; confidence: number } {
  const raw = Number(parsed.confidence);
  const confidence = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0.5;
  const { confidence: _omit, ...rest } = parsed;
  return { parsed: rest, confidence };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

async function handle(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return json({ error: "Method Not Allowed" }, 405);
  if (!AI_API_KEY) return json({ error: "EXPENSE_PARSE_AI_API_KEY is not configured" }, 503);

  const body = (await request.json().catch(() => null)) as { documentId?: string } | null;
  const documentId = body?.documentId;
  if (!documentId) return json({ error: "documentId is required" }, 400);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Authenticate + load the document. Two paths (see header comment).
  let doc: Record<string, any> | null = null;
  const jobToken = request.headers.get("x-job-token");
  if (jobToken) {
    const claims = await verifyJobToken(jobToken, documentId);
    const { data, error } = await admin.from("document_intake").select("*").eq("id", documentId).maybeSingle();
    if (error) throw error;
    if (!data || data.user_id !== claims.sub) return json({ error: "Document not found" }, 404);
    doc = data;
  } else {
    const authHeader = request.headers.get("authorization") ?? "";
    const caller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userError } = await caller.auth.getUser();
    if (userError || !userData.user) return json({ error: "Authentication required" }, 401);
    const { data, error } = await admin
      .from("document_intake")
      .select("*")
      .eq("id", documentId)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return json({ error: "Document not found" }, 404);
    doc = data;
  }

  const markFailed = async (message: string) => {
    await admin
      .from("document_intake")
      .update({ parse_status: "failed", parse_error: message.slice(0, 1000) })
      .eq("id", documentId);
  };

  try {
    await admin.from("document_intake").update({ parse_status: "processing" }).eq("id", documentId);

    const { data: file, error: dlError } = await admin.storage.from(BUCKET).download(doc.file_path as string);
    if (dlError || !file) throw new Error(`Storage download failed: ${dlError?.message ?? "no file"}`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = (doc.mime_type as string) || file.type || "application/octet-stream";
    const profile = (doc.profile as string) || "general";

    let result: { parsed: Record<string, unknown>; confidence: number };
    if (mimeType.startsWith("audio/")) {
      const { text } = await transcribeAudio(bytes, (doc.file_name as string) || "audio", mimeType);
      result = await structureFromText(profile, text);
      result.parsed = { ...result.parsed, transcript: text };
    } else if (mimeType.startsWith("text/")) {
      result = await structureFromText(profile, new TextDecoder().decode(bytes));
    } else {
      result = await structureFromFile(profile, bytes, mimeType);
    }

    const { error: upError } = await admin
      .from("document_intake")
      .update({ parse_status: "parsed", parsed_json: result.parsed, confidence: result.confidence, parse_error: null })
      .eq("id", documentId);
    if (upError) throw upError;

    return json({ data: { documentId, parse_status: "parsed", confidence: result.confidence } });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Parse failed";
    await markFailed(message).catch(() => undefined);
    return json({ error: message }, 422);
  }
}

Deno.serve(async (request) => {
  try {
    return await handle(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "expense-document-parse failed";
    return json({ error: message }, /token|Authentication/i.test(message) ? 401 : 400);
  }
});

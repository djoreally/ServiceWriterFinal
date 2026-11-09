/**
 * Job-scoped tokens for the expense-document-parse Edge Function.
 *
 * Mirrors the signed-state pattern already proven in this codebase
 * (google-calendar-sync): an HMAC-SHA256 signature over a base64url JSON
 * payload, keyed by a purpose-prefixed derivation of the server-only
 * service-role secret. No new dependency, no new stored secret: the
 * token is minted by trusted server code for ONE document and ONE job,
 * expires in minutes, and the Edge Function verifies it with the same
 * derivation in its own runtime.
 *
 * Payload: { doc, sub (owner user id), scope: "expense-document-parse",
 *            exp, jti }
 */
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const TRANSCRIPTION_JOB_SCOPE = "expense-document-parse";
const MAX_TTL_MS = 15 * 60_000;
const DEFAULT_TTL_MS = 10 * 60_000;

function signingSecret(): string {
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!base) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return `expense-parse-job:${base}`;
}

function b64urlEncode(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

function sign(payloadB64: string): string {
  return createHmac("sha256", signingSecret()).update(payloadB64).digest("base64url");
}

export interface TranscriptionJobClaims {
  doc: string;
  sub: string;
  scope: string;
  exp: number;
  jti: string;
}

export function mintTranscriptionJobToken(input: {
  documentId: string;
  ownerUserId: string;
  ttlMs?: number;
}): string {
  const ttl = Math.min(MAX_TTL_MS, Math.max(30_000, input.ttlMs ?? DEFAULT_TTL_MS));
  const claims: TranscriptionJobClaims = {
    doc: input.documentId,
    sub: input.ownerUserId,
    scope: TRANSCRIPTION_JOB_SCOPE,
    exp: Date.now() + ttl,
    jti: randomUUID(),
  };
  const payload = b64urlEncode(JSON.stringify(claims));
  return `${payload}.${sign(payload)}`;
}

export function verifyTranscriptionJobToken(
  token: string,
  expectedDocumentId: string,
): TranscriptionJobClaims {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) {
    throw new Error("Malformed job token");
  }
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Invalid job token signature");
  }
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TranscriptionJobClaims;
  if (claims.scope !== TRANSCRIPTION_JOB_SCOPE) throw new Error("Job token scope mismatch");
  if (claims.doc !== expectedDocumentId) throw new Error("Job token document mismatch");
  if (typeof claims.exp !== "number" || claims.exp <= Date.now()) throw new Error("Job token expired");
  return claims;
}

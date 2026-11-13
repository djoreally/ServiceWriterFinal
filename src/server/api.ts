/**
 * AI TERRITORY: OWNER-GATED — see docs/ai-territory.md.
 * No agent changes without Ty's explicit word.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseRequestClient, createSupabaseServerClient } from "@/lib/supabase";
import { captureServerError, type ServerErrorContext } from "@/server/sentry";

export const workspaceIdSchema = z.string().uuid();

export class ApiError extends Error {
  constructor(public status: number, message: string, public code = "api_error") {
    super(message);
  }
}

/**
 * CORS is origin-aware: a request's `Origin` is reflected ONLY when it is
 * on the allowlist. The office app is same-origin and never needed this;
 * the technician app (a separate origin) is blocked by the browser
 * without a reflected `Access-Control-Allow-Origin`, which is why this
 * allowlist exists. Non-allowlisted origins receive no CORS headers at
 * all, and credentials are only ever paired with a reflected allowlisted
 * origin — never a wildcard.
 */
const DEFAULT_CORS_ORIGINS: readonly string[] = [
  "https://www.servicewriter.xyz",
  "https://servicewriter.xyz",
  "https://lovable-tech-partner.vercel.app",
  "https://techapp.servicewriter.xyz",
];

/** Origins configured via NEXT_PUBLIC_CORS_ORIGIN (comma-separated list; a single value keeps working). */
function configuredCorsOrigins(): string[] {
  return (process.env.NEXT_PUBLIC_CORS_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export function corsAllowedOrigins(): string[] {
  return [...DEFAULT_CORS_ORIGINS, ...configuredCorsOrigins()];
}

export function corsHeaders(requestOrigin?: string | null) {
  const headers = new Headers();
  let allowOrigin: string | undefined;
  if (requestOrigin) {
    // A browser request: reflect the origin only if it is allowlisted.
    if (corsAllowedOrigins().includes(requestOrigin)) {
      allowOrigin = requestOrigin;
    }
  } else {
    // No request Origin to judge (non-browser client, or a caller that
    // does not have the request in hand): preserve the historical
    // behavior — emit the env-configured origin when one is set, and
    // nothing when it is not.
    allowOrigin = configuredCorsOrigins()[0];
  }
  if (allowOrigin) {
    headers.set("Access-Control-Allow-Origin", allowOrigin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Access-Control-Allow-Headers", "authorization, content-type");
    headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
    headers.set("Vary", "Origin");
  }
  return headers;
}

export function json<T>(data: T, init?: ResponseInit, requestOrigin?: string | null) {
  const headers = corsHeaders(requestOrigin);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  return NextResponse.json(data, { ...init, headers });
}

/**
 * Sanitize a Postgres raise_exception message for client display.
 * Keeps the human-readable part ("Cannot start appointment from current
 * status") while stripping machine prefixes ("INVALID_TRANSITION: ") and
 * refusing to leak internal record/field references.
 */
function sanitizeRpcMessage(message: string | undefined): { code: string; message: string } {
  const text = (message ?? "").trim();
  if (!text) return { code: "transition_rejected", message: "The requested change was rejected." };
  const prefix = /^([A-Z][A-Z0-9_]+):\s*/.exec(text)?.[1]?.toLowerCase();
  const stripped = text.replace(/^[A-Z][A-Z0-9_]+:\s*/, "");
  if (/record\s+".*?"\s+has no field/i.test(stripped) || /column\s+.*?\s+does not exist/i.test(stripped)) {
    return { code: prefix ?? "transition_rejected", message: "The requested change could not be completed." };
  }
  return { code: prefix ?? "transition_rejected", message: stripped.slice(0, 300) };
}

/**
 * Hono only routes `instanceof Error` throws to `onError`. PostgREST returns
 * plain-object errors (`{ message, details, hint, code }`), so `if (error)
 * throw error` in a route would bypass `errorResponse` entirely — and the
 * P0001 mapping with it — surfacing as a bare 500 instead of the honest
 * error. Normalize non-Error throws so every route keeps the error contract.
 * `Error` instances (ApiError, ZodError, PostgrestError, ...) pass through
 * untouched; the PostgREST `code`/`details`/`hint` fields are preserved so
 * `errorResponse` can still map them.
 */
export function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  const record = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  const message = typeof record.message === "string" && record.message.trim()
    ? record.message
    : "The request could not be completed.";
  const error = new Error(message);
  for (const key of ["code", "details", "hint", "status"] as const) {
    const field = record[key];
    if (field !== undefined) (error as unknown as Record<string, unknown>)[key] = field;
  }
  return error;
}

export function errorResponse(error: unknown, requestContext: ServerErrorContext = {}, requestOrigin?: string | null) {
  // Every envelope below is built through this helper so the CORS
  // treatment matches json(): the request origin is reflected only when
  // allowlisted (see corsHeaders).
  const respond = (data: unknown, init?: ResponseInit) => json(data, init, requestOrigin);

  if (error instanceof ApiError) {
    // Deliberately raised API errors are expected outcomes; only a 5xx
    // ApiError is a server fault worth reporting to Sentry.
    if (error.status >= 500) {
      captureServerError(error, { ...requestContext, code: error.code, status: error.status });
    }
    return respond({ error: { code: error.code, message: error.message } }, { status: error.status });
  }

  // Postgres raise_exception from RPCs (e.g. technician_transition_job_v1
  // INVALID_TRANSITION / CONFLICT_ERROR). Surface the RPC's own message as a
  // 409 instead of hiding it behind "An unexpected error occurred."
  // Exclusion-constraint violations (23P01) are booking conflicts: the slot
  // was taken between the availability check and the insert.

  // Client input failed validation — this is a 400, never a 500.
  if (error instanceof z.ZodError) {
    const firstIssue = error.issues[0];
    const detail = firstIssue
      ? `${firstIssue.path.join(".") || "input"}: ${firstIssue.message}`
      : "Invalid request input.";
    return respond({ error: { code: "invalid_input", message: detail } }, { status: 400 });
  }

  const candidate = error as {
    code?: string;
    message?: string;
    status?: number;
    details?: string;
    hint?: string;
    name?: string;
  } | null;
  const code = candidate?.code;
  if (code === "PGRST116") {
    return respond({ error: { code: "not_found", message: "The requested record is no longer available." } }, { status: 404 });
  }
  if (code === "23505") {
    return respond({ error: { code: "conflict", message: "This record already exists." } }, { status: 409 });
  }
  if (code === "23503") {
    return respond({ error: { code: "invalid_reference", message: "A related record could not be found." } }, { status: 409 });
  }
  if (code === "P0001") {
    const sanitized = sanitizeRpcMessage(candidate?.message);
    return respond({ error: { code: sanitized.code, message: sanitized.message } }, { status: 409 });
  }
  if (code === "23P01") {
    return respond(
      { error: { code: "schedule_conflict", message: "The requested time overlaps an existing appointment or buffer." } },
      { status: 409 },
    );
  }
  if (code === "22P02" || code === "22007" || code === "22023") {
    return respond({ error: { code: "invalid_input", message: "One or more values are invalid." } }, { status: 400 });
  }
  // PostgREST's own error codes (PGRST*) mean the database gateway could
  // not serve the request as asked — most importantly PGRST202, "function
  // not in the schema cache", which fires when an RPC's migration has
  // not landed (or the cache has not refreshed) yet. Preserve the
  // original code and message under a 503 instead of masking them as
  // internal_error: clients key designed fallbacks off the PGRST202
  // code (the appointment start command's PATCH fallback), and a masked
  // 500 leaves them with a dead button and no signal. PostgREST
  // messages name the missing object/signature; they carry no user
  // data. Postgres SQLSTATEs are deliberately NOT swept in here — they
  // keep the mappings above (or internal_error) unchanged.
  if (typeof code === "string" && /^PGRST\d+$/.test(code)) {
    // A 503 from the database gateway is a server-side fault (missing RPC,
    // stale schema cache, pool failure) — report it with its real code.
    captureServerError(error, { ...requestContext, code, status: 503 });
    return respond(
      { error: { code, message: candidate?.message ?? "The request could not be completed." } },
      { status: 503 },
    );
  }
  if (candidate?.status && candidate.status >= 400 && candidate.status < 600) {
    if (candidate.status >= 500) {
      captureServerError(error, { ...requestContext, code: code ?? "request_failed", status: candidate.status });
    }
    return respond({ error: { code: code ?? "request_failed", message: candidate.message ?? "The request could not be completed." } }, { status: candidate.status });
  }

  const diagnostic = error instanceof Error
    ? { name: error.name, message: error.message }
    : candidate && typeof candidate === "object"
      ? {
          name: candidate.name,
          code: candidate.code,
          message: candidate.message,
          details: candidate.details,
          hint: candidate.hint,
          status: candidate.status,
        }
      : { type: typeof error };
  console.error("[api] unexpected error", diagnostic);
  // The internal_error fallthrough is the class that used to vanish (e.g.
  // the 2026-11-10 phantom-column 42703 sat here unseen for six hours).
  // Report it under its real diagnostic identity before masking it.
  captureServerError(error, { ...requestContext, code: code ?? "internal_error", status: 500 });
  return respond({ error: { code: "internal_error", message: "An unexpected error occurred." } }, { status: 500 });
}

export async function requireUser(request?: Request) {
  const authorization = request?.headers.get("authorization");
  const bearerToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (bearerToken) {
    const supabase = createSupabaseRequestClient(bearerToken);
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw new ApiError(401, "Authentication required", "unauthenticated");
    return { supabase, user: data.user };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new ApiError(401, "Authentication required", "unauthenticated");
  return { supabase, user: data.user };
}

export async function requireWorkspaceMember(workspaceId: string, roles?: string[], request?: Request) {
  const parsed = workspaceIdSchema.safeParse(workspaceId);
  if (!parsed.success) throw new ApiError(400, "Invalid workspace_id", "invalid_workspace");
  const { supabase, user } = await requireUser(request);
  const query = supabase
    .from("workspace_members")
    .select("workspace_id,user_id,role,is_active")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  const { data: membership, error } = await query;
  if (error) throw error;
  if (!membership) throw new ApiError(403, "You are not a member of this workspace", "forbidden");
  if (roles && !roles.includes(membership.role)) throw new ApiError(403, "Insufficient workspace permissions", "forbidden");
  return { supabase, user, membership };
}

export async function requireWorkspacePaymentsAddon(workspaceId: string, roles?: string[], request?: Request) {
  const authorized = await requireWorkspaceMember(workspaceId, roles, request);
  const { data: billing, error } = await authorized.supabase
    .from("workspace_billing")
    .select("payments_addon_active,subscription_status")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  const subscriptionActive = billing?.subscription_status === "active" || billing?.subscription_status === "trialing";
  if (!billing?.payments_addon_active || !subscriptionActive) {
    throw new ApiError(402, "The Payments add-on is required for this workspace", "payments_addon_required");
  }
  return { ...authorized, billing };
}

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Authorizes CRM access against the active request identity and workspace.
 * The database function remains the source of truth for capability grants and
 * RLS still applies to every subsequent table query.
 */
export async function requireCrmCapability(
  request: Request,
  workspaceId: string,
  capability: string,
) {
  const parsedWorkspace = workspaceIdSchema.safeParse(workspaceId);
  if (!parsedWorkspace.success) throw new ApiError(400, "Invalid workspace_id", "invalid_workspace");

  const { supabase, user } = await requireUser(request);
  const { data, error } = await supabase.rpc("has_crm_capability", {
    target_workspace_id: workspaceId,
    required_capability: capability,
  });
  if (error) throw error;
  if (data !== true) throw new ApiError(403, "CRM capability required", "crm_forbidden");

  return { supabase, user };
}

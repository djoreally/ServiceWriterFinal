/**
 * api-client.ts — the single sanctioned HTTP path for client-side code.
 *
 * Every browser-side request to this app's own API must go through this
 * module (directly via `apiClient`/`apiRequest`, or through a domain wrapper
 * that delegates here, e.g. `@/lib/nextApiClient`). Raw `fetch()` calls to
 * `/api/...` and direct Supabase REST reads from UI code are not allowed;
 * the Hono layer in `src/server/hono` is the only server boundary.
 *
 * Conventions:
 * - Same-origin `/api` base (honours `NEXT_PUBLIC_API_BASE_URL` when set).
 * - The Supabase session access token is attached automatically as
 *   `Authorization: Bearer <token>` — this is exactly what the server
 *   (`requireUser` in `src/server/api.ts`, wrapped by the Hono auth
 *   middleware) expects as the request identity.
 * - JSON request/response by default; non-2xx responses are parsed into
 *   `ApiClientError { status, code, message }` from the
 *   `{ error: { code, message } }` envelope the server always returns.
 * - Every request has a 15s timeout by default (override with `timeout`;
 *   `0` disables it). A timeout throws `ApiClientError` with code `"timeout"`
 *   so callers can distinguish it from other network failures and offer retry.
 * - Query params and extra headers are supported per call.
 */

import { supabase } from "@/integrations/supabase/client";

/**
 * Typed error for failed API calls. `code` comes from the server's
 * `{ error: { code, message } }` envelope (e.g. `unauthenticated`,
 * `forbidden`, `not_found`, `conflict`); it falls back to `api_error` when
 * the server returned no structured body.
 */
export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

type ApiErrorBody = { error?: { code?: string; message?: string } };

export type ApiQueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Array<string | number | boolean>;

export interface ApiRequestOptions {
  /** Serialized into the URL query string. `null`/`undefined` values are skipped. */
  query?: Record<string, ApiQueryValue>;
  /** Extra headers. An explicit `Authorization` header always wins over the session token. */
  headers?: HeadersInit;
  signal?: AbortSignal;
  /**
   * Request timeout in milliseconds. Defaults to 15s. Set to `0` to disable
   * (e.g. long uploads). A timeout throws `ApiClientError` with code `"timeout"`.
   */
  timeout?: number;
  credentials?: RequestCredentials;
}

/** Default request timeout — a hung serverless function must never brick the UI. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "/api").replace(/\/$/, "");

function appendQuery(path: string, query: Record<string, ApiQueryValue> | undefined): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      for (const entry of value) params.append(key, String(entry));
    } else {
      params.set(key, String(value));
    }
  }
  const suffix = params.toString();
  return suffix ? `${path}${path.includes("?") ? "&" : "?"}${suffix}` : path;
}

function isPlainJsonBody(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  return (
    !(body instanceof FormData) &&
    !(body instanceof Blob) &&
    !(body instanceof URLSearchParams) &&
    !(body instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(body)
  );
}

async function attachSessionToken(headers: Headers): Promise<void> {
  if (headers.has("Authorization")) return;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers.set("Authorization", `Bearer ${session.access_token}`);
    }
  } catch {
    // Session storage may be unavailable (private mode, SSR, etc.).
    // The request still goes out; the server will answer 401 if it needs auth.
  }
}

/**
 * Low-level request. Prefer the `apiClient` verb helpers; reach for this when
 * you need full `RequestInit` control (custom method, streaming, etc.).
 */
export async function apiRequest<T>(
  path: string,
  init: RequestInit & ApiRequestOptions = {},
): Promise<T> {
  const { query, credentials, timeout, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set("Accept", "application/json");

  let body = rest.body;
  if (body !== undefined && isPlainJsonBody(body)) {
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    body = JSON.stringify(body) as BodyInit;
  }

  await attachSessionToken(headers);

  const timeoutMs = timeout ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const timeoutSignal = timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined;
  const signal =
    timeoutSignal && rest.signal ? AbortSignal.any([rest.signal, timeoutSignal]) : (timeoutSignal ?? rest.signal);

  const url = appendQuery(path.startsWith("http") ? path : `${API_BASE}${path}`, query);
  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      headers,
      body,
      signal,
      credentials: credentials ?? "include",
    });
  } catch (err) {
    // AbortSignal.timeout() aborts with a DOMException named "TimeoutError".
    if (timeoutSignal?.aborted && err instanceof DOMException && err.name === "TimeoutError") {
      throw new ApiClientError(
        0,
        "timeout",
        `Request timed out after ${timeoutMs}ms: ${path}`,
      );
    }
    throw err;
  }

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as ApiErrorBody;
    throw new ApiClientError(
      response.status,
      errorBody.error?.code || "api_error",
      errorBody.error?.message || "Request failed",
    );
  }

  if (response.status === 204) return undefined as T;
  // `json()` first: matches the historical client contract and works with
  // fetch mocks that only implement `json()`.
  const payload = await response.json().catch(() => undefined);
  return payload as T;
}

/**
 * The typed API client. `path` is relative to `/api` (e.g. `/v1/workspaces`
 * or `/appointments/123`); `body` on write verbs is JSON-encoded unless it is
 * already a string, FormData, Blob, URLSearchParams, or binary.
 */
export const apiClient = {
  get: <T>(path: string, options: ApiRequestOptions = {}): Promise<T> =>
    apiRequest<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options: ApiRequestOptions = {}): Promise<T> =>
    apiRequest<T>(path, { ...options, method: "POST", body: body as BodyInit }),
  put: <T>(path: string, body?: unknown, options: ApiRequestOptions = {}): Promise<T> =>
    apiRequest<T>(path, { ...options, method: "PUT", body: body as BodyInit }),
  patch: <T>(path: string, body?: unknown, options: ApiRequestOptions = {}): Promise<T> =>
    apiRequest<T>(path, { ...options, method: "PATCH", body: body as BodyInit }),
  delete: <T>(path: string, options: ApiRequestOptions = {}): Promise<T> =>
    apiRequest<T>(path, { ...options, method: "DELETE" }),
};

export type ApiClient = typeof apiClient;

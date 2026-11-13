/**
 * Quick Lube Data (QLD) Developer API client — server-side only.
 *
 * QLD is the platform's single spec source (owner's ruling, 2026-11-05):
 * Service Writer is its first integration and specs arrive by live
 * lookup, never from a bundled snapshot. This module owns the wire:
 *
 *   - The key comes from the QLD_API_KEY server env var only. It is
 *     never bundled client-side, never logged, never put in a URL.
 *   - Fail-open by contract: no key, a timeout, a non-200, or a
 *     malformed body all answer `null` — the caller degrades to
 *     "spec not recorded", never to a user-facing error. Nothing in
 *     here throws.
 *   - The 10s timeout mirrors Fleet Mail's vinDecode QLD client, the
 *     in-house pattern for this API.
 */

export const QLD_BASE_URL = "https://quicklube-backend.vercel.app";
export const QLD_TIMEOUT_MS = 10_000;

export interface QldHttpResult {
  status: number;
  body: Record<string, unknown>;
}

export interface QldClientDeps {
  /** Defaults to the QLD_API_KEY env var. Injectable for tests. */
  apiKey?: string | null;
  /** Defaults to global fetch. Injectable for tests. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  baseUrl?: string;
}

export function qldApiKey(): string {
  return process.env.QLD_API_KEY?.trim() ?? "";
}

export function isQldConfigured(deps: QldClientDeps = {}): boolean {
  return Boolean((deps.apiKey ?? qldApiKey()).trim());
}

/**
 * One GET against the Developer API. Returns the HTTP status and the
 * parsed JSON body ({} when the body is not a JSON object), or null
 * when the call could not be made at all (no key, network error,
 * timeout). HTTP error statuses are returned, not nulled: the
 * engine-required answer travels as an HTTP 400 body and the caller
 * needs to see it.
 */
export async function fetchQldJson(
  path: string,
  deps: QldClientDeps = {},
): Promise<QldHttpResult | null> {
  const key = (deps.apiKey ?? qldApiKey()).trim();
  if (!key) return null;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? QLD_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${deps.baseUrl ?? QLD_BASE_URL}${path}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-API-Key": key,
      },
      signal: controller.signal,
    });
    let body: Record<string, unknown> = {};
    try {
      const parsed: unknown = await response.json();
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        body = parsed as Record<string, unknown>;
      }
    } catch {
      body = {};
    }
    return { status: response.status, body };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Query string for the YMM(+engine) lookups; engine only when known. */
export function qldYmmQuery(input: {
  year: number;
  make: string;
  model: string;
  engine?: string | null;
}): string {
  const params = new URLSearchParams({
    year: String(input.year),
    make: input.make,
    model: input.model,
  });
  const engine = typeof input.engine === "string" ? input.engine.trim() : "";
  if (engine) params.set("engine", engine);
  return params.toString();
}

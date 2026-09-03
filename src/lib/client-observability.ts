const SENSITIVE_KEYWORDS = ["email", "phone", "name", "address", "token", "authorization", "password", "secret"];

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEYWORDS.some((needle) => lower.includes(needle));
}

function sanitizeContext(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (value.length > 300) return `${value.slice(0, 297)}...`;
    return value.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL_REDACTED]");
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 10).map((item) => sanitizeContext(item));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 25)) {
      out[k] = isSensitiveKey(k) ? "[REDACTED]" : sanitizeContext(v);
    }
    return out;
  }
  return String(value);
}

export function generateCorrelationId(prefix = "corr"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The legacy `client_error_events` table is not part of the canonical
 * workspace-scoped production schema. Until client telemetry is reintroduced
 * through a supported server endpoint, this reporter is intentionally a no-op
 * so a primary request failure cannot generate a second failing REST request.
 */
export async function reportClientError(input: {
  supabaseUrl: string;
  publishableKey: string;
  accessToken?: string | null;
  userId?: string | null;
  correlationId?: string | null;
  endpoint?: string | null;
  statusCode?: number | null;
  errorMessage: string;
  severity?: "info" | "warning" | "error" | "critical";
  context?: Record<string, unknown>;
}): Promise<void> {
  // Retain sanitization code and signature for callers; do not emit network IO.
  void sanitizeContext(input.context || {});
}

const SENSITIVE_KEYWORDS = ["email", "phone", "name", "address", "token", "authorization", "password", "secret"];
const TELEMETRY_FAILURE_THRESHOLD = 2;
const TELEMETRY_COOLDOWN_MS = 60_000;

let consecutiveTelemetryFailures = 0;
let telemetryDisabledUntil = 0;
let telemetryRequestInFlight = false;

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
  if (!input.supabaseUrl || !input.publishableKey || !input.errorMessage) return;
  // Telemetry must not amplify a backend outage. Only one report may be in
  // flight, and repeated telemetry failures open a short circuit.
  if (Date.now() < telemetryDisabledUntil || telemetryRequestInFlight) return;
  telemetryRequestInFlight = true;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: input.publishableKey,
  };
  if (input.accessToken) {
    headers.Authorization = `Bearer ${input.accessToken}`;
  }

  const payload = {
    user_id: input.userId || null,
    source: "web_app",
    correlation_id: input.correlationId || null,
    endpoint: input.endpoint || null,
    status_code: input.statusCode || null,
    severity: input.severity || "error",
    error_message: input.errorMessage.slice(0, 1000),
    context: sanitizeContext(input.context || {}),
  };

  try {
    const response = await fetch(`${input.supabaseUrl}/rest/v1/client_error_events`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      keepalive: true,
    });
    if (!response.ok) {
      consecutiveTelemetryFailures += 1;
      if (consecutiveTelemetryFailures >= TELEMETRY_FAILURE_THRESHOLD) {
        telemetryDisabledUntil = Date.now() + TELEMETRY_COOLDOWN_MS;
      }
      return;
    }
    consecutiveTelemetryFailures = 0;
  } catch {
    consecutiveTelemetryFailures += 1;
    if (consecutiveTelemetryFailures >= TELEMETRY_FAILURE_THRESHOLD) {
      telemetryDisabledUntil = Date.now() + TELEMETRY_COOLDOWN_MS;
    }
    // Swallow intentionally: observability must never break primary flows.
  } finally {
    telemetryRequestInFlight = false;
  }
}

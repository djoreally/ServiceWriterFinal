import type { SupabaseClient } from "@supabase/supabase-js";

const SAFE_CORRELATION = /^[A-Za-z0-9._:-]{1,128}$/;
const SAFE_AUDIT_NAME = /^[a-z][a-z0-9_.:-]{0,127}$/;
const SENSITIVE_METADATA_KEY = /(authorization|cookie|credential|email|password|phone|secret|token|vin)/i;
const MAX_METADATA_ENTRIES = 32;
const MAX_METADATA_STRING_LENGTH = 512;

export type OperationalAuditValue = string | number | boolean | null;

export function sanitizeOperationalAuditMetadata(
  metadata: Record<string, OperationalAuditValue> = {},
): Record<string, OperationalAuditValue> {
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([key, value]) =>
        SAFE_AUDIT_NAME.test(key)
        && !SENSITIVE_METADATA_KEY.test(key)
        && value !== undefined
        && value !== null,
      )
      .slice(0, MAX_METADATA_ENTRIES)
      .map(([key, value]) => [
        key,
        typeof value === "string" ? value.slice(0, MAX_METADATA_STRING_LENGTH) : value,
      ]),
  );
}

function safeAuditName(value: string, field: string): string {
  if (!SAFE_AUDIT_NAME.test(value)) throw new TypeError(`Invalid operational audit ${field}`);
  return value;
}

export function requestCorrelationId(request?: Request): string {
  const candidate = request?.headers.get("x-request-id") || request?.headers.get("x-correlation-id") || crypto.randomUUID();
  return SAFE_CORRELATION.test(candidate) ? candidate : crypto.randomUUID();
}

export async function recordOperationalAudit(input: {
  supabase: SupabaseClient;
  request?: Request;
  workspaceId?: string | null;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, OperationalAuditValue>;
}): Promise<{ correlationId: string; persisted: boolean }> {
  const correlationId = requestCorrelationId(input.request);
  const action = safeAuditName(input.action, "action");
  const entityType = safeAuditName(input.entityType, "entity type");
  const metadata = sanitizeOperationalAuditMetadata(input.metadata);
  const requestIdCandidate = input.request?.headers.get("x-request-id") ?? null;
  const requestId = requestIdCandidate && SAFE_CORRELATION.test(requestIdCandidate) ? requestIdCandidate : null;
  const { error } = await input.supabase.from("audit_events").insert({
    workspace_id: input.workspaceId ?? null,
    actor_user_id: input.actorUserId ?? null,
    action,
    entity_type: entityType,
    entity_id: input.entityId ?? null,
    correlation_id: correlationId,
    request_id: requestId,
    metadata,
  });
  if (error) {
    // Do not log provider error text: it can include query details or record data.
    console.error("operational_audit_write_failed", { correlationId });
  }
  return { correlationId, persisted: !error };
}

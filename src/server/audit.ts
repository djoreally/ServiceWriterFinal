import type { SupabaseClient } from "@supabase/supabase-js";

const SAFE_CORRELATION = /^[A-Za-z0-9._:-]{1,128}$/;

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
  metadata?: Record<string, string | number | boolean | null>;
}) {
  const correlationId = requestCorrelationId(input.request);
  const metadata = Object.fromEntries(Object.entries(input.metadata ?? {}).filter(([key, value]) =>
    SAFE_CORRELATION.test(key) && value !== undefined && value !== null,
  ));
  const { error } = await input.supabase.from("audit_events").insert({
    workspace_id: input.workspaceId ?? null,
    actor_user_id: input.actorUserId ?? null,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    correlation_id: correlationId,
    request_id: input.request?.headers.get("x-request-id") || null,
    metadata,
  });
  if (error) console.error("operational_audit_write_failed", error.message);
}

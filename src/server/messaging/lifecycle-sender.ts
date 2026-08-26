import { createSupabaseAdminClient } from "@/lib/supabase";
import { ResendEmailAdapter } from "@/server/messaging/resend";
import { renderLifecycleEmail, type LifecycleVariables } from "@/server/messaging/lifecycle-templates";

export type LifecycleSendInput = {
  workspaceId: string;
  recipientEmail: string;
  customerId?: string | null;
  templateKey: string;
  idempotencyKey: string;
  variables: LifecycleVariables;
  metadata?: Record<string, string>;
};

type OutboxRow = {
  id: string;
  workspace_id: string;
  event_key: string;
  entity_type: string;
  entity_id: string;
  recipient_email: string | null;
  recipient_role: string;
  payload: { variables?: LifecycleVariables; metadata?: Record<string, string>; customerId?: string | null };
  idempotency_key: string;
  attempts: number;
};

function assertEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("Invalid lifecycle recipient email");
  return normalized;
}

export async function enqueueLifecycleEmail(input: LifecycleSendInput & {
  eventId: string;
  entityType?: string;
  entityId?: string;
  recipientRole?: string;
}): Promise<{ id: string; status: "queued" }> {
  const rendered = renderLifecycleEmail(input.templateKey, input.variables);
  const email = assertEmail(input.recipientEmail);
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("enqueue_lifecycle_event", {
    p_workspace_id: input.workspaceId,
    p_event_key: rendered.templateKey,
    p_entity_type: input.entityType ?? "platform",
    p_entity_id: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.entityId ?? "")
      ? input.entityId
      : crypto.randomUUID(),
    p_idempotency_key: input.idempotencyKey,
    p_recipient_email: email,
    p_recipient_role: input.recipientRole ?? "customer",
    p_payload: {
      variables: input.variables,
      metadata: input.metadata ?? {},
      customerId: input.customerId ?? null,
      renderedSubject: rendered.subject,
      renderedText: rendered.text,
    },
  });
  if (error || !data) throw error ?? new Error("Lifecycle event enqueue returned no id");
  return { id: String(Array.isArray(data) ? data[0] : data), status: "queued" };
}

export async function sendLifecycleEmail(input: LifecycleSendInput) {
  const rendered = renderLifecycleEmail(input.templateKey, input.variables);
  const supabase = createSupabaseAdminClient();
  const existing = await supabase
    .from("message_logs")
    .select("id,provider_message_id,status")
    .eq("workspace_id", input.workspaceId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();

  if (existing.data?.provider_message_id && ["accepted", "sent", "delivered"].includes(existing.data.status)) {
    return { providerMessageId: existing.data.provider_message_id, status: existing.data.status };
  }

  const queued = await supabase.from("message_logs").upsert({
    workspace_id: input.workspaceId,
    customer_id: input.customerId ?? null,
    channel: "email",
    purpose: rendered.purpose,
    provider: "resend",
    idempotency_key: input.idempotencyKey,
    recipient_email: assertEmail(input.recipientEmail),
    template_key: rendered.templateKey,
    subject: rendered.subject,
    body_redacted: rendered.body.slice(0, 240),
    status: "queued",
    metadata: input.metadata ?? {},
  }, { onConflict: "workspace_id,idempotency_key" }).select("id").single();

  if (queued.error) throw queued.error;

  try {
    const sent = await new ResendEmailAdapter().send({
      workspaceId: input.workspaceId,
      recipient: { email: assertEmail(input.recipientEmail) },
      purpose: rendered.purpose,
      templateKey: rendered.templateKey,
      subject: rendered.subject,
      body: rendered.text,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata ?? {},
    });
    const updated = await supabase.from("message_logs").update({
      provider_message_id: sent.providerMessageId,
      status: sent.status,
      sent_at: sent.acceptedAt,
      failure_code: null,
      failure_reason: null,
    }).eq("id", queued.data.id);
    if (updated.error) throw updated.error;
    return sent;
  } catch (error) {
    await supabase.from("message_logs").update({
      status: "failed",
      failed_at: new Date().toISOString(),
      failure_reason: error instanceof Error ? error.message.slice(0, 500) : "Email provider failed",
    }).eq("id", queued.data.id);
    throw error;
  }
}

export async function processLifecycleEventOutbox(limit = 50, workerId = `vercel:${crypto.randomUUID()}`) {
  const supabase = createSupabaseAdminClient();
  const { data: claimed, error } = await supabase.rpc("claim_lifecycle_events", {
    p_limit: Math.max(1, Math.min(limit, 200)),
    p_worker_id: workerId,
  });
  if (error) throw error;

  const results = { claimed: (claimed ?? []).length, sent: 0, failed: 0, deadLettered: 0 };
  for (const row of (claimed ?? []) as OutboxRow[]) {
    try {
      if (!row.recipient_email) throw new Error("Lifecycle outbox row has no customer recipient");
      const payload = row.payload ?? {};
      await sendLifecycleEmail({
        workspaceId: row.workspace_id,
        recipientEmail: row.recipient_email,
        customerId: payload.customerId,
        templateKey: row.event_key,
        idempotencyKey: `lifecycle:${row.event_key}:${row.idempotency_key}:${row.recipient_email.toLowerCase()}`,
        variables: payload.variables ?? {},
        metadata: payload.metadata ?? { lifecycleEventId: row.id, recipientRole: row.recipient_role },
      });
      const completed = await supabase.rpc("complete_lifecycle_event", {
        p_id: row.id,
        p_worker_id: workerId,
        p_sent: true,
        p_error: null,
        p_retry_seconds: 300,
      });
      if (completed.error) throw completed.error;
      results.sent += 1;
    } catch (sendError) {
      const completed = await supabase.rpc("complete_lifecycle_event", {
        p_id: row.id,
        p_worker_id: workerId,
        p_sent: false,
        p_error: sendError instanceof Error ? sendError.message : "Lifecycle delivery failed",
        p_retry_seconds: Math.min(86400, 30 * 2 ** Math.min(row.attempts, 8)),
      });
      if (completed.error) console.error("[Lifecycle] failed to release outbox row", completed.error);
      results.failed += 1;
      if (row.attempts >= 8) results.deadLettered += 1;
    }
  }
  return results;
}

import { createSupabaseAdminClient } from "@/lib/supabase";
import { EnginemailerEmailAdapter } from "@/server/messaging/enginemailer";
import { renderLifecycleEmail, type LifecycleVariables } from "@/server/messaging/lifecycle-templates";
import type { LifecyclePurpose } from "@/server/messaging/lifecycle-templates";
import type { MessagingAdapter } from "@/server/messaging/types";

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

export function lifecycleAdapterForPurpose(purpose: LifecyclePurpose): MessagingAdapter {
  void purpose;
  return new EnginemailerEmailAdapter();
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

export async function sendLifecycleEmail(input: LifecycleSendInput): Promise<{ providerMessageId?: string; status: string }> {
  const rendered = renderLifecycleEmail(input.templateKey, input.variables);
  const supabase = createSupabaseAdminClient();
  const recipientEmail = assertEmail(input.recipientEmail);
  const adapter = lifecycleAdapterForPurpose(rendered.purpose);
  const checkedAt = new Date().toISOString();
  const suppression = await supabase.rpc("messaging_has_active_suppression", {
    target_workspace_id: input.workspaceId,
    target_channel: "email",
    target_purpose: rendered.purpose,
    target_email: recipientEmail,
    target_phone: null,
  });
  if (suppression.error) throw suppression.error;
  const consent = rendered.purpose === "marketing"
    ? await supabase.from("messaging_consents").select("status").eq("workspace_id", input.workspaceId).eq("channel", "email").eq("purpose", "marketing").eq("contact_email", recipientEmail).order("updated_at", { ascending: false }).limit(1).maybeSingle()
    : { data: { status: "not_required" }, error: null };
  if (consent.error) throw consent.error;
  const suppressed = Boolean(suppression.data) || (rendered.purpose === "marketing" && consent.data?.status !== "granted");
  if (suppressed) {
    const canceled = await supabase.from("message_logs").upsert({
      workspace_id: input.workspaceId,
      customer_id: input.customerId ?? null,
      channel: "email",
      purpose: rendered.purpose,
      provider: adapter.providerName,
      idempotency_key: input.idempotencyKey,
      recipient_email: recipientEmail,
      template_key: rendered.templateKey,
      subject: rendered.subject,
      body_redacted: rendered.body.slice(0, 240),
      status: "canceled",
      failure_code: rendered.purpose === "marketing" ? "consent_required" : "suppressed",
      failure_reason: rendered.purpose === "marketing" ? "Marketing consent is not granted" : "Recipient is actively suppressed",
      consent_checked_at: checkedAt,
      suppression_checked_at: checkedAt,
      metadata: input.metadata ?? {},
    }, { onConflict: "workspace_id,idempotency_key" }).select("id").single();
    if (canceled.error) throw canceled.error;
    return { status: "suppressed" };
  }
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
    provider: adapter.providerName,
    idempotency_key: input.idempotencyKey,
    recipient_email: recipientEmail,
    template_key: rendered.templateKey,
    subject: rendered.subject,
    body_redacted: rendered.body.slice(0, 240),
    status: "queued",
    consent_checked_at: checkedAt,
    suppression_checked_at: checkedAt,
    metadata: input.metadata ?? {},
  }, { onConflict: "workspace_id,idempotency_key" }).select("id").single();

  if (queued.error) throw queued.error;

  let sent;
  try {
    sent = await adapter.send({
      workspaceId: input.workspaceId,
      recipient: { email: recipientEmail },
      purpose: rendered.purpose,
      templateKey: rendered.templateKey,
      subject: rendered.subject,
      body: rendered.text,
      html: rendered.html,
      fromName: typeof input.variables["business.name"] === "string" ? String(input.variables["business.name"]) : "Service Writer",
      replyTo: typeof input.variables["business.email"] === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(input.variables["business.email"])) ? String(input.variables["business.email"]) : undefined,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata ?? {},
    });
  } catch (error) {
    await supabase.from("message_logs").update({
      status: "failed",
      failed_at: new Date().toISOString(),
      failure_code: "provider_send_failed",
      failure_reason: "Email provider rejected the delivery request",
    }).eq("id", queued.data.id);
    throw new Error("provider_send_failed", { cause: error });
  }

  const updated = await supabase.from("message_logs").update({
      provider_message_id: sent.providerMessageId,
      status: sent.status,
      sent_at: sent.acceptedAt,
      failure_code: null,
      failure_reason: null,
      failed_at: null,
  }).eq("id", queued.data.id);
  if (updated.error) {
    // The provider has already accepted the message. Retrying here can create a
    // duplicate, so surface only a safe reconciliation signal and let the
    // lifecycle event complete successfully.
    console.error("lifecycle_message_log_reconciliation_failed", {
      workspaceId: input.workspaceId,
      idempotencyKey: input.idempotencyKey,
    });
  }
  return sent;
}

export async function processLifecycleEventOutbox(limit = 50, workerId = `vercel:${crypto.randomUUID()}`) {
  const supabase = createSupabaseAdminClient();
  const { data: claimed, error } = await supabase.rpc("claim_lifecycle_events", {
    p_limit: Math.max(1, Math.min(limit, 200)),
    p_worker_id: workerId,
  });
  if (error) throw error;

  const results = { claimed: (claimed ?? []).length, sent: 0, suppressed: 0, failed: 0, deadLettered: 0, completionConflicts: 0 };
  for (const row of (claimed ?? []) as OutboxRow[]) {
    try {
      if (!row.recipient_email) throw new Error("Lifecycle outbox row has no customer recipient");
      const payload = row.payload ?? {};
      const delivery = await sendLifecycleEmail({
        workspaceId: row.workspace_id,
        recipientEmail: row.recipient_email,
        customerId: payload.customerId,
        templateKey: row.event_key,
        idempotencyKey: row.idempotency_key,
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
      if (completed.data !== true) {
        results.completionConflicts += 1;
        console.error("lifecycle_outbox_completion_conflict", { eventId: row.id, workspaceId: row.workspace_id });
        continue;
      }
      if (delivery.status === "suppressed") results.suppressed += 1;
      else results.sent += 1;
    } catch (sendError) {
      const completed = await supabase.rpc("complete_lifecycle_event", {
        p_id: row.id,
        p_worker_id: workerId,
        p_sent: false,
        p_error: "lifecycle_delivery_failed",
        p_retry_seconds: Math.min(86400, 30 * 2 ** Math.min(row.attempts, 8)),
      });
      if (completed.error || completed.data !== true) {
        results.completionConflicts += 1;
        console.error("lifecycle_outbox_release_conflict", { eventId: row.id, workspaceId: row.workspace_id });
      }
      console.error("[Lifecycle] outbox delivery failed", {
        eventId: row.id,
        eventKey: row.event_key,
        workspaceId: row.workspace_id,
        attempts: row.attempts,
        errorCode: sendError instanceof Error ? sendError.message.slice(0, 64) : "lifecycle_delivery_failed",
      });
      results.failed += 1;
      if (row.attempts >= 8) results.deadLettered += 1;
    }
  }
  return results;
}

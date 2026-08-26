import { createSupabaseAdminClient } from "@/lib/supabase";
import type { InboundReply, MessagingAdapter, NormalizedDeliveryEvent } from "./types";

const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;
function parseWebhookPayload(rawBody: string): Record<string, unknown> | null {
  if (new TextEncoder().encode(rawBody).byteLength > MAX_WEBHOOK_BODY_BYTES) return null;
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function externalEventId(request: Request, payload: Record<string, unknown>): string {
  return request.headers.get("svix-id") || request.headers.get("x-twilio-request-id") || String(payload.id || payload.MessageSid || payload.SmsSid || crypto.randomUUID());
}

async function findWorkspaceForMessage(supabase: ReturnType<typeof createSupabaseAdminClient>, provider: string, providerMessageId?: string) {
  if (!providerMessageId) return null;
  const { data } = await supabase.from("message_logs").select("workspace_id").eq("provider", provider).eq("provider_message_id", providerMessageId).maybeSingle();
  return data?.workspace_id ?? null;
}

async function recordWebhookEvent(supabase: ReturnType<typeof createSupabaseAdminClient>, provider: string, eventId: string, payload: Record<string, unknown>, workspaceId: string | null) {
  const result = await supabase.from("webhook_events").upsert({
    provider,
    external_event_id: eventId,
    event_type: typeof payload.type === "string" ? payload.type : typeof payload.MessageStatus === "string" ? "twilio.message.status" : "twilio.message.inbound",
    workspace_id: workspaceId,
    signature_verified: true,
    status: "received",
    payload,
  }, { onConflict: "provider,external_event_id", ignoreDuplicates: true }).select("id").maybeSingle();
  if (result.error) throw result.error;
  return result.data?.id ?? null;
}

export async function ingestDeliveryWebhook(provider: string, adapter: MessagingAdapter, request: Request, rawBody: string): Promise<{ accepted: boolean; duplicate: boolean; count: number }> {
  const payload = parseWebhookPayload(rawBody);
  if (!payload || !adapter.verifyWebhook(request, rawBody)) return { accepted: false, duplicate: false, count: 0 };
  const events = adapter.normalizeDelivery(rawBody, request);
  const supabase = createSupabaseAdminClient();
  const workspaceId = await findWorkspaceForMessage(supabase, provider, events[0]?.providerMessageId);
  const eventId = externalEventId(request, payload);
  const webhookId = await recordWebhookEvent(supabase, provider, eventId, payload, workspaceId);
  if (!webhookId || events.length === 0) return { accepted: true, duplicate: !webhookId, count: 0 };

  let inserted = 0;
  for (const event of events) {
    const { error } = await supabase.from("message_delivery_events").upsert({
      workspace_id: workspaceId,
      message_log_id: workspaceId ? (await findMessageId(supabase, provider, event.providerMessageId)) : null,
      provider,
      provider_event_id: event.providerEventId || eventId,
      provider_message_id: event.providerMessageId,
      status: event.status,
      recipient_email: event.recipient?.includes("@") ? event.recipient : null,
      recipient_phone: event.recipient?.includes("@") ? null : event.recipient,
      failure_code: event.failureCode,
      failure_reason: event.failureReason,
      raw_payload: event.rawPayload,
      occurred_at: event.occurredAt,
    }, { onConflict: "provider,provider_event_id", ignoreDuplicates: true });
    if (!error) inserted += 1;
    await supabase.rpc("messaging_apply_delivery_event", {
      target_provider: provider,
      target_provider_message_id: event.providerMessageId,
      target_status: event.status,
      target_occurred_at: event.occurredAt,
      target_failure_code: event.failureCode ?? null,
      target_failure_reason: event.failureReason ?? null,
    });
    if (workspaceId && event.recipient?.includes("@") && (event.status === "bounced" || event.status === "complained")) {
      const suppressionResult = await supabase.rpc("messaging_record_delivery_suppression", {
        target_workspace_id: workspaceId,
        target_email: event.recipient,
        target_reason: event.status,
      });
      if (suppressionResult.error) console.error("[Messaging] failed to record delivery suppression", suppressionResult.error);
    }
  }
  await supabase.from("webhook_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("id", webhookId);
  return { accepted: true, duplicate: inserted === 0, count: inserted };
}

async function findMessageId(supabase: ReturnType<typeof createSupabaseAdminClient>, provider: string, providerMessageId: string) {
  const { data } = await supabase.from("message_logs").select("id").eq("provider", provider).eq("provider_message_id", providerMessageId).maybeSingle();
  return data?.id ?? null;
}

export async function ingestInboundWebhook(provider: string, adapter: MessagingAdapter, request: Request, rawBody: string): Promise<{ accepted: boolean; duplicate: boolean; count: number }> {
  const payload = parseWebhookPayload(rawBody);
  if (!payload || !adapter.verifyWebhook(request, rawBody) || !adapter.normalizeInbound) return { accepted: false, duplicate: false, count: 0 };
  const replies: InboundReply[] = adapter.normalizeInbound(rawBody, request);
  const supabase = createSupabaseAdminClient();
  const workspaceId = await findWorkspaceByDestination(supabase, provider, replies[0]?.to);
  const webhookId = await recordWebhookEvent(supabase, provider, externalEventId(request, payload), payload, workspaceId);
  if (!webhookId || replies.length === 0) return { accepted: true, duplicate: !webhookId, count: 0 };
  let inserted = 0;
  for (const reply of replies) {
    const { error } = await supabase.from("inbound_messages").upsert({
      workspace_id: workspaceId,
      channel: "sms",
      provider,
      provider_event_id: reply.providerEventId || externalEventId(request, payload),
      provider_message_id: reply.providerMessageId,
      from_address: reply.from,
      to_address: reply.to,
      body: reply.body,
      status: "received",
      raw_payload: reply.rawPayload,
      received_at: reply.receivedAt,
    }, { onConflict: "provider,provider_event_id", ignoreDuplicates: true });
    if (!error) inserted += 1;
  }
  await supabase.from("webhook_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("id", webhookId);
  return { accepted: true, duplicate: inserted === 0, count: inserted };
}

async function findWorkspaceByDestination(supabase: ReturnType<typeof createSupabaseAdminClient>, provider: string, destination?: string) {
  if (!destination) return null;
  const { data } = await supabase.from("provider_connections").select("workspace_id").eq("provider", provider === "twilio" ? "sms" : "resend").contains("metadata", { inbound_destination: destination }).maybeSingle();
  return data?.workspace_id ?? null;
}

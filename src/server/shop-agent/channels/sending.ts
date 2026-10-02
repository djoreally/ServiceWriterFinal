/**
 * Shared Shop Agent SMS send path (provider-agnostic).
 *
 * Sends through any ShopSmsSender (AgentPhoneAdapter in production, the stub
 * in dev/tests), then mirrors the send into the existing `message_logs`
 * table (same pattern as src/server/messaging/lifecycle-sender.ts: upsert
 * on workspace_id,idempotency_key). The message_logs row lets later stages
 * resolve the recipient phone for a past send without keeping raw PII in
 * the ledger, and surfaces Shop Agent sends in the existing /v1/sms
 * timeline views.
 *
 * Idempotency note: not every provider offers an idempotency key
 * (AgentPhone's POST /v1/messages has none — every call bills). The
 * idempotencyKey below is OUR audit key for message_logs; true
 * exactly-once comes from the ledger-based dedupe in the channel layer
 * (textback_sent / sms_received entries), which never retries a send that
 * already has a ledger entry.
 */
import type { ShopAgentSupabase } from "./db";

export interface ShopSmsSendResult {
  providerMessageId: string;
  providerName: string;
  status: "queued" | "accepted" | "sent";
  acceptedAt: string;
}

export interface ShopSmsSendInput {
  to: string;
  body: string;
  idempotencyKey: string;
  templateKey: string;
  metadata?: Record<string, string>;
}

/**
 * Minimal provider-agnostic SMS sender. AgentPhoneAdapter implements this;
 * providers without a native idempotency key simply ignore idempotencyKey
 * (documented per adapter).
 */
export interface ShopSmsSender {
  readonly providerName: string;
  sendSms(input: ShopSmsSendInput): Promise<ShopSmsSendResult>;
}

export interface ShopSmsRequest {
  workspaceId: string;
  to: string;
  body: string;
  idempotencyKey: string;
  templateKey: string;
  metadata?: Record<string, string>;
}

export async function sendShopSms(
  supabase: ShopAgentSupabase,
  sender: ShopSmsSender,
  input: ShopSmsRequest,
): Promise<ShopSmsSendResult> {
  const sent = await sender.sendSms({
    to: input.to,
    body: input.body,
    idempotencyKey: input.idempotencyKey,
    templateKey: input.templateKey,
    metadata: input.metadata,
  });
  // Best-effort audit row: the SMS is already accepted by the provider at
  // this point, so a logging failure must not fail the send.
  try {
    const { error } = await supabase.from("message_logs").upsert(
      {
        workspace_id: input.workspaceId,
        channel: "sms",
        purpose: "transactional",
        provider: sent.providerName,
        idempotency_key: input.idempotencyKey,
        recipient_phone: input.to,
        template_key: input.templateKey,
        body_redacted: input.body.slice(0, 240),
        status: sent.status,
        provider_message_id: sent.providerMessageId,
        sent_at: sent.acceptedAt,
        metadata: input.metadata ?? {},
      },
      { onConflict: "workspace_id,idempotency_key" },
    );
    if (error) throw error;
  } catch (error) {
    console.error("shop_agent_message_log_failed", {
      workspaceId: input.workspaceId,
      idempotencyKey: input.idempotencyKey,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return sent;
}

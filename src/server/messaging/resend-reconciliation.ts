import { createSupabaseAdminClient } from "@/lib/supabase";
import type { DeliveryStatus } from "@/server/messaging/types";
import { requiredEnv } from "@/server/messaging/types";

const RESEND_API_URL = "https://api.resend.com";

type PendingMessage = {
  id: string;
  workspace_id: string;
  provider_message_id: string;
  recipient_email: string | null;
  status: string;
};

type ResendEmailSnapshot = {
  id?: string;
  to?: string[];
  created_at?: string;
  last_event?: string;
  message_id?: string;
};

function normalizeLastEvent(lastEvent: string | undefined): DeliveryStatus | null {
  switch ((lastEvent ?? "").toLowerCase()) {
    case "delivered":
    case "opened":
    case "clicked":
      return "delivered";
    case "bounced":
      return "bounced";
    case "complained":
      return "complained";
    case "failed":
      return "failed";
    case "suppressed":
      return "undeliverable";
    case "sent":
      return "sent";
    case "delivery_delayed":
      return "accepted";
    default:
      return null;
  }
}

async function retrieveResendEmail(providerMessageId: string): Promise<ResendEmailSnapshot> {
  const response = await fetch(`${RESEND_API_URL}/emails/${encodeURIComponent(providerMessageId)}`, {
    headers: { Authorization: `Bearer ${requiredEnv("RESEND_API_KEY")}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Resend retrieve email failed with HTTP ${response.status}`);
  }
  return await response.json() as ResendEmailSnapshot;
}

/**
 * Backstops delivery webhooks with provider-side reconciliation.
 *
 * Resend exposes the latest delivery state on GET /emails/:id. The lifecycle
 * cron uses this to close accepted/sent messages when a webhook is missing,
 * delayed, or misconfigured. Webhooks remain the preferred real-time path;
 * this is an idempotent observability/reconciliation safety net.
 */
export async function reconcileResendDeliveryStatuses(limit = 50): Promise<number> {
  const supabase = createSupabaseAdminClient();
  const cutoff = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data, error } = await supabase
    .from("message_logs")
    .select("id,workspace_id,provider_message_id,recipient_email,status")
    .eq("provider", "resend")
    .in("status", ["accepted", "sent"])
    .not("provider_message_id", "is", null)
    .lt("sent_at", cutoff)
    .order("sent_at", { ascending: true })
    .limit(Math.max(1, Math.min(limit, 100)));
  if (error) throw error;

  let reconciled = 0;
  for (const row of (data ?? []) as PendingMessage[]) {
    try {
      const snapshot = await retrieveResendEmail(row.provider_message_id);
      const status = normalizeLastEvent(snapshot.last_event);
      if (!status || status === row.status) continue;

      const occurredAt = new Date().toISOString();
      const providerEventId = `reconcile:${row.provider_message_id}:${snapshot.last_event}`;
      const recipient = snapshot.to?.[0] ?? row.recipient_email ?? null;
      const eventInsert = await supabase.from("message_delivery_events").upsert({
        workspace_id: row.workspace_id,
        message_log_id: row.id,
        provider: "resend",
        provider_event_id: providerEventId,
        provider_message_id: row.provider_message_id,
        status,
        recipient_email: recipient,
        recipient_phone: null,
        failure_code: null,
        failure_reason: status === "undeliverable" ? "Provider reports recipient suppressed" : null,
        raw_payload: {
          source: "resend_status_reconciliation",
          provider_snapshot: snapshot,
        },
        occurred_at: occurredAt,
      }, { onConflict: "provider,provider_event_id", ignoreDuplicates: true });
      if (eventInsert.error) throw eventInsert.error;

      const applied = await supabase.rpc("messaging_apply_delivery_event", {
        target_provider: "resend",
        target_provider_message_id: row.provider_message_id,
        target_status: status,
        target_occurred_at: occurredAt,
        target_failure_code: null,
        target_failure_reason: status === "undeliverable" ? "Provider reports recipient suppressed" : null,
      });
      if (applied.error) throw applied.error;
      reconciled += 1;
    } catch (error) {
      console.error("[Lifecycle] Resend status reconciliation failed", {
        messageLogId: row.id,
        providerMessageId: row.provider_message_id,
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  return reconciled;
}

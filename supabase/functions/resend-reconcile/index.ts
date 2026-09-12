import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type DeliveryStatus = "accepted" | "sent" | "delivered" | "bounced" | "complained" | "failed" | "undeliverable";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

function normalize(lastEvent?: string): DeliveryStatus | null {
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

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ ok: false, error: "method_not_allowed" }, { status: 405 });
  }

  const apiKey = Deno.env.get("RESEND_API_KEY")?.trim();
  if (!apiKey) {
    return Response.json({ ok: false, error: "worker_not_configured" }, { status: 503 });
  }

  const startedAt = Date.now();
  const body = await req.json().catch(() => ({})) as { limit?: number };
  const limit = Math.max(1, Math.min(Number(body.limit ?? 10), 25));
  const cutoff = new Date(Date.now() - 2 * 60_000).toISOString();

  const { data, error } = await supabase
    .from("message_logs")
    .select("id,workspace_id,provider_message_id,recipient_email,status")
    .eq("provider", "resend")
    .in("status", ["accepted", "sent"])
    .not("provider_message_id", "is", null)
    .lt("sent_at", cutoff)
    .order("sent_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[ResendReconcile] query failed", { message: error.message });
    return Response.json({ ok: false, error: "query_failed" }, { status: 500 });
  }

  let reconciled = 0;
  let failed = 0;

  for (const row of data ?? []) {
    try {
      const response = await fetch(
        `https://api.resend.com/emails/${encodeURIComponent(row.provider_message_id)}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      if (!response.ok) throw new Error(`resend_http_${response.status}`);

      const snapshot = await response.json() as { last_event?: string; to?: string[] };
      const status = normalize(snapshot.last_event);
      if (!status || status === row.status) continue;

      const occurredAt = new Date().toISOString();
      const providerEventId = `reconcile:${row.provider_message_id}:${snapshot.last_event}`;

      const eventInsert = await supabase.from("message_delivery_events").upsert({
        workspace_id: row.workspace_id,
        message_log_id: row.id,
        provider: "resend",
        provider_event_id: providerEventId,
        provider_message_id: row.provider_message_id,
        status,
        recipient_email: snapshot.to?.[0] ?? row.recipient_email ?? null,
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
      failed += 1;
      console.error("[ResendReconcile] item failed", {
        messageLogId: row.id,
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  return Response.json({
    ok: true,
    scanned: (data ?? []).length,
    reconciled,
    failed,
    durationMs: Date.now() - startedAt,
  });
});

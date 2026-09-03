import webpush from "web-push";
import { createSupabaseAdminClient } from "@/lib/supabase";

interface PushOutboxRow {
  id: string;
  notification_id: string;
  subscription_id: string;
  attempts: number;
  worker_id: string;
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  endpoint: string;
  p256dh: string;
  auth_key: string;
}

let vapidConfigured = false;

function configureVapid() {
  if (vapidConfigured) return;
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:security@servicewriter.xyz";
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) throw new Error("Web Push VAPID keys are not configured");
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
}

function notificationUrl(metadata: Record<string, unknown> | null): string {
  const url = metadata?.url;
  return typeof url === "string" && url.startsWith("/") ? url : "/tech-app";
}

export async function processInAppNotificationPushOutbox(
  limit = 50,
  workerId = `vercel:push:${crypto.randomUUID()}`,
) {
  const supabase = createSupabaseAdminClient();
  const { count, error: countError } = await supabase
    .from("in_app_notification_push_outbox")
    .select("id", { count: "exact", head: true })
    .in("status", ["pending", "failed", "processing"]);
  if (countError) throw countError;
  if (!count) return { claimed: 0, sent: 0, failed: 0, staleSubscriptions: 0 };

  configureVapid();
  const { data: claimed, error } = await supabase.rpc("claim_in_app_push_outbox", {
    p_limit: Math.max(1, Math.min(limit, 200)),
    p_worker_id: workerId,
  });
  if (error) throw error;

  const results = { claimed: (claimed ?? []).length, sent: 0, failed: 0, staleSubscriptions: 0 };
  for (const row of (claimed ?? []) as PushOutboxRow[]) {
    try {
      await webpush.sendNotification(
        {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth_key },
        },
        JSON.stringify({
          title: row.title,
          body: row.message,
          tag: `notification:${row.notification_id}`,
          url: notificationUrl(row.metadata),
        }),
        { TTL: 300, urgency: "high" },
      );
      const completed = await supabase.rpc("complete_in_app_push_outbox", {
        p_id: row.id,
        p_worker_id: workerId,
        p_sent: true,
        p_error: null,
        p_retry_seconds: 300,
      });
      if (completed.error) throw completed.error;
      results.sent += 1;
    } catch (error) {
      const statusCode = typeof error === "object" && error !== null && "statusCode" in error
        ? Number((error as { statusCode?: number }).statusCode)
        : 0;
      if (statusCode === 404 || statusCode === 410) {
        await supabase
          .from("tech_push_subscriptions")
          .update({ disabled_at: new Date().toISOString() })
          .eq("id", row.subscription_id);
        results.staleSubscriptions += 1;
      }
      const completed = await supabase.rpc("complete_in_app_push_outbox", {
        p_id: row.id,
        p_worker_id: workerId,
        p_sent: false,
        p_error: statusCode === 404 || statusCode === 410 ? "subscription_gone" : error instanceof Error ? error.message : "Push delivery failed",
        p_retry_seconds: Math.min(86400, 30 * 2 ** Math.min(row.attempts, 8)),
      });
      if (completed.error) console.error("[Push] failed to complete outbox row", completed.error);
      results.failed += 1;
    }
  }
  return results;
}

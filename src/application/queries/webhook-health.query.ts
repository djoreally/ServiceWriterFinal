/**
 * Webhook Health Queries
 * Abstracts webhook_event_logs table access and replay edge function calls.
 */
import { supabase } from "@/integrations/supabase/client";

export interface WebhookEventLog {
  id: string;
  stripe_event_id: string;
  event_type: string;
  payload: unknown;
  status: "pending" | "processing" | "succeeded" | "failed" | "dead_letter" | "replayed";
  error_message: string | null;
  error_details: unknown;
  attempts: number;
  max_attempts: number;
  user_id: string | null;
  related_record_id: string | null;
  related_record_type: string | null;
  created_at: string;
  processed_at: string | null;
  last_attempt_at: string;
  replayed_at: string | null;
  replayed_by: string | null;
}

export interface WebhookStats {
  total: number;
  succeeded: number;
  failed: number;
  deadLetter: number;
  pending: number;
  replayed: number;
  successRate: number;
}

type WebhookFilter = "all" | "failed" | "dead_letter";

export async function fetchWebhookEvents(filter: WebhookFilter): Promise<WebhookEventLog[]> {
  let query = supabase
    .from("webhook_event_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (filter === "failed") {
    query = query.in("status", ["failed", "dead_letter"]);
  } else if (filter === "dead_letter") {
    query = query.eq("status", "dead_letter");
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as unknown as WebhookEventLog[];
}

export function calculateWebhookStats(events: WebhookEventLog[]): WebhookStats {
  const succeeded = events.filter((e) => e.status === "succeeded" || e.status === "replayed").length;
  const failed = events.filter((e) => e.status === "failed").length;
  const deadLetter = events.filter((e) => e.status === "dead_letter").length;
  const pending = events.filter((e) => e.status === "pending" || e.status === "processing").length;
  const replayed = events.filter((e) => e.status === "replayed").length;

  return {
    total: events.length,
    succeeded,
    failed,
    deadLetter,
    pending,
    replayed,
    successRate: events.length > 0 ? Math.round((succeeded / events.length) * 100) : 100,
  };
}

export async function replayWebhookEvent(eventLogId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const { data, error } = await supabase.functions.invoke("replay-webhook-event", {
    body: { event_log_id: eventLogId, action: "replay" },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}

export async function dismissWebhookEvent(eventLogId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const { data, error } = await supabase.functions.invoke("replay-webhook-event", {
    body: { event_log_id: eventLogId, action: "dismiss" },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}

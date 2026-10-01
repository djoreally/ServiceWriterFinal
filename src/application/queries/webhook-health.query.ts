/**
 * Webhook Health Queries
 * Abstracts webhook event inspection and replay/dismiss actions.
 */
import { apiClient } from "@/lib/api-client";

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
  const { data } = await apiClient.get<{ data: WebhookEventLog[] }>("/v1/admin/webhook-events", {
    query: { filter },
  });
  return data ?? [];
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
  const { data } = await apiClient.post<{ data: { error?: string } | null }>(
    `/v1/admin/webhook-events/${eventLogId}/replay`,
    {},
  );
  if (data?.error) throw new Error(data.error);
}

export async function dismissWebhookEvent(eventLogId: string): Promise<void> {
  const { data } = await apiClient.post<{ data: { error?: string } | null }>(
    `/v1/admin/webhook-events/${eventLogId}/dismiss`,
    {},
  );
  if (data?.error) throw new Error(data.error);
}

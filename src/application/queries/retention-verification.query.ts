/**
 * Retention verification queries — snapshot counts and recent activity for the
 * one-click retention verification page. Data is scoped to the current user
 * and today's UTC day boundary (matching the previous inline behaviour).
 */
import { supabase } from "@/integrations/supabase/client";

export interface RetentionVerificationCounts {
  servicesCompleted: number;
  retentionEvents: number;
  reviewActions: number;
  reviewRequests: number;
  reviewEmailsQueued: number;
  reviewEmailsSent: number;
}

export type RetentionVerificationRow = Record<string, unknown> & { id: string };

export interface RetentionVerificationSnapshot {
  counts: RetentionVerificationCounts;
  recentEvents: RetentionVerificationRow[];
  recentActions: RetentionVerificationRow[];
  recentEmails: RetentionVerificationRow[];
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function fetchRetentionVerificationSnapshot(
  userId: string,
): Promise<RetentionVerificationSnapshot> {
  const todayIso = startOfTodayIso();

  const [services, events, actions, reviews, queue, recentE, recentA, recentEm] = await Promise.all([
    supabase
      .from("services")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "completed")
      .gte("updated_at", todayIso),
    supabase
      .from("retention_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("occurred_at", todayIso),
    supabase
      .from("retention_action_executions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("action_type", "send_review_request")
      .gte("created_at", todayIso),
    supabase
      .from("review_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", todayIso),
    supabase
      .from("email_queue")
      .select("id, status")
      .eq("user_id", userId)
      .eq("email_type", "review_request")
      .gte("created_at", todayIso),
    supabase
      .from("retention_events")
      .select("id, event_name, occurred_at, processed_at, customer_id")
      .eq("user_id", userId)
      .gte("occurred_at", todayIso)
      .order("occurred_at", { ascending: false })
      .limit(10),
    supabase
      .from("retention_action_executions")
      .select("id, action_type, status, executed_at, created_at")
      .eq("user_id", userId)
      .gte("created_at", todayIso)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("email_queue")
      .select("id, email_type, recipient_email, status, scheduled_for, sent_at, error_message")
      .eq("user_id", userId)
      .eq("email_type", "review_request")
      .gte("created_at", todayIso)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const queueRows = (queue.data as Array<{ status: string }> | null) ?? [];

  return {
    counts: {
      servicesCompleted: services.count ?? 0,
      retentionEvents: events.count ?? 0,
      reviewActions: actions.count ?? 0,
      reviewRequests: reviews.count ?? 0,
      reviewEmailsQueued: queueRows.length,
      reviewEmailsSent: queueRows.filter((r) => r.status === "sent").length,
    },
    recentEvents: ((recentE.data as RetentionVerificationRow[] | null) ?? []),
    recentActions: ((recentA.data as RetentionVerificationRow[] | null) ?? []),
    recentEmails: ((recentEm.data as RetentionVerificationRow[] | null) ?? []),
  };
}

export interface CompletedServiceForBackfill {
  id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  total_cost: number | null;
  service_date: string | null;
  updated_at: string;
}

export async function fetchTodaysCompletedServices(
  userId: string,
): Promise<CompletedServiceForBackfill[]> {
  const todayIso = startOfTodayIso();
  const { data, error } = await supabase
    .from("services")
    .select("id, customer_id, vehicle_id, total_cost, service_date, updated_at")
    .eq("user_id", userId)
    .eq("status", "completed")
    .gte("updated_at", todayIso);
  if (error) throw error;
  return (data ?? []) as CompletedServiceForBackfill[];
}

export async function fetchExistingRetentionEventAggregateIds(
  userId: string,
  aggregateIds: string[],
): Promise<Set<string>> {
  if (aggregateIds.length === 0) return new Set();
  const todayIso = startOfTodayIso();
  const { data, error } = await supabase
    .from("retention_events")
    .select("aggregate_id")
    .eq("user_id", userId)
    .eq("event_name", "service_order.completed")
    .in("aggregate_id", aggregateIds)
    .gte("occurred_at", todayIso);
  if (error) throw error;
  return new Set(((data as Array<{ aggregate_id: string }> | null) ?? []).map((r) => r.aggregate_id));
}

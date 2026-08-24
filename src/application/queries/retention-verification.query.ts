/** Retention verification — canonical service completion snapshot.
 * Retention/review automation tables have not been rebuilt on Final yet.
 */
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

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

export async function fetchRetentionVerificationSnapshot(_userId: string): Promise<RetentionVerificationSnapshot> {
  const context = await resolveCurrentWorkspace();
  if (!context) {
    return { counts: { servicesCompleted: 0, retentionEvents: 0, reviewActions: 0, reviewRequests: 0, reviewEmailsQueued: 0, reviewEmailsSent: 0 }, recentEvents: [], recentActions: [], recentEmails: [] };
  }
  const todayIso = startOfTodayIso();
  const { count, error } = await supabase.from("service_records")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", context.workspaceId)
    .eq("status", "completed")
    .gte("updated_at", todayIso);
  if (error) throw error;
  return {
    counts: {
      servicesCompleted: count ?? 0,
      retentionEvents: 0,
      reviewActions: 0,
      reviewRequests: 0,
      reviewEmailsQueued: 0,
      reviewEmailsSent: 0,
    },
    recentEvents: [], recentActions: [], recentEmails: [],
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

export async function fetchTodaysCompletedServices(_userId: string): Promise<CompletedServiceForBackfill[]> {
  const context = await resolveCurrentWorkspace();
  if (!context) return [];
  const todayIso = startOfTodayIso();
  const { data, error } = await (supabase.from("service_records") as any)
    .select("id,customer_id,vehicle_id,total_amount,completed_at,created_at,updated_at")
    .eq("workspace_id", context.workspaceId)
    .eq("status", "completed")
    .gte("updated_at", todayIso);
  if (error) throw error;
  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    customer_id: row.customer_id ?? null,
    vehicle_id: row.vehicle_id ?? null,
    total_cost: row.total_amount == null ? null : Number(row.total_amount),
    service_date: (row.completed_at ?? row.created_at)?.slice(0, 10) ?? null,
    updated_at: row.updated_at,
  }));
}

/** No retention_events store exists on Final yet, so no aggregate IDs are persisted. */
export async function fetchExistingRetentionEventAggregateIds(_userId: string, _aggregateIds: string[]): Promise<Set<string>> {
  return new Set();
}

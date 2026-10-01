/** Retention verification — canonical service completion snapshot.
 * Retention/review automation tables have not been rebuilt on Final yet.
 */
import { apiClient } from "@/lib/api-client";
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

export async function fetchRetentionVerificationSnapshot(_userId: string): Promise<RetentionVerificationSnapshot> {
  const context = await resolveCurrentWorkspace();
  if (!context) {
    return { counts: { servicesCompleted: 0, retentionEvents: 0, reviewActions: 0, reviewRequests: 0, reviewEmailsQueued: 0, reviewEmailsSent: 0 }, recentEvents: [], recentActions: [], recentEmails: [] };
  }
  const { data } = await apiClient.get<{ data: RetentionVerificationSnapshot }>("/v1/crm/retention/verification/snapshot", {
    query: { workspace_id: context.workspaceId },
  });
  return data;
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
  const { data } = await apiClient.get<{ data: CompletedServiceForBackfill[] }>("/v1/crm/retention/verification/completed-services", {
    query: { workspace_id: context.workspaceId },
  });
  return data ?? [];
}

/** No retention_events store exists on Final yet, so no aggregate IDs are persisted. */
export async function fetchExistingRetentionEventAggregateIds(_userId: string, _aggregateIds: string[]): Promise<Set<string>> {
  return new Set();
}

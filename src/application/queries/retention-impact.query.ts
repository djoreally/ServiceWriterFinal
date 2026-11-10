/**
 * Retention Impact Queries — Derived metrics and grouped signals for the Command Center.
 *
 * Backed by existing tables: retention_signals, retention_vehicle_profiles, customers.
 * No schema changes required.
 */
import { apiClient } from "@/lib/api-client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

async function retentionWorkspaceId(): Promise<string> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("No active workspace is available.");
  return context.workspaceId;
}

// ── Types ────────────────────────────────────────────────────
export type ImpactMetrics = {
  revenueAtRisk: number;
  winbackCustomers: number;
  overdueVehicles: number;
  loyaltyActive: number;
  trendDelta: number; // % change vs previous 30d (signal volume)
};

export type GroupedSignal = {
  signal_type: string;
  count: number;
  avg_score: number;
  max_score: number;
  estimated_impact: number; // $ derived from LTV when joinable
  signal_ids: string[];
  customer_ids: string[];
  vehicle_ids: string[];
  oldest_detected_at: string | null;
  newest_detected_at: string | null;
};

export type SignalRow = {
  id: string;
  signal_type: string;
  status: string;
  score: number | null;
  detected_at: string;
  customer_id: string | null;
  vehicle_id: string | null;
  payload_jsonb: Record<string, unknown> | null;
  customer?: { id: string; name: string | null; email: string | null; phone: string | null; lifetime_value: number | null } | null;
};

// ── Hero Impact Metrics ──────────────────────────────────────
export async function fetchImpactMetrics(_userId: string): Promise<ImpactMetrics> {
  const workspaceId = await retentionWorkspaceId();
  const { data } = await apiClient.get<{ data: ImpactMetrics }>("/v1/crm/retention/impact/metrics", {
    query: { workspace_id: workspaceId },
  });
  return data;
}

// ── Grouped Signals (Action Queue) ───────────────────────────
export async function fetchGroupedActionableSignals(_userId: string): Promise<GroupedSignal[]> {
  const workspaceId = await retentionWorkspaceId();
  const { data } = await apiClient.get<{ data: GroupedSignal[] }>("/v1/crm/retention/impact/action-queue", {
    query: { workspace_id: workspaceId },
  });
  return data ?? [];
}

// ── Group Drill-down (signals + customer info) ───────────────
export async function fetchSignalsByIds(signalIds: string[]): Promise<SignalRow[]> {
  if (!signalIds.length) return [];
  const workspaceId = await retentionWorkspaceId();
  const { data } = await apiClient.get<{ data: SignalRow[] }>("/v1/crm/retention/signals/by-ids", {
    query: { ids: signalIds.join(","), workspace_id: workspaceId },
  });
  return data ?? [];
}

// ── Signal Log (chronological, filterable) ───────────────────
export type SignalLogFilters = {
  type?: string;
  status?: string;
  scoreMin?: number;
  limit?: number;
};

export async function fetchSignalLog(_userId: string, filters: SignalLogFilters = {}) {
  const workspaceId = await retentionWorkspaceId();
  const { data } = await apiClient.get<{ data: SignalRow[] }>("/v1/crm/retention/signal-log", {
    query: {
      workspace_id: workspaceId,
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(typeof filters.scoreMin === "number" ? { score_min: String(filters.scoreMin) } : {}),
      limit: String(filters.limit ?? 200),
    },
  });
  return data ?? [];
}

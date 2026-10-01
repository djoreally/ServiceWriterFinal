import { apiClient } from "@/lib/api-client";

export interface RewardsBackfillDryRunParams {
  providerId: string;
  fromCompletedAt?: string | null;
  toCompletedAt?: string | null;
  limit?: number;
}

export async function dryRunRewardsBackfill(params: RewardsBackfillDryRunParams): Promise<Record<string, unknown>> {
  const { data } = await apiClient.post<{ data: Record<string, unknown> }>("/v1/crm/loyalty/backfill/dry-run", {
    provider_id: params.providerId,
    from_completed_at: params.fromCompletedAt ?? null,
    to_completed_at: params.toCompletedAt ?? null,
    limit: params.limit ?? 500,
  });
  return (data || {}) as Record<string, unknown>;
}

export async function getRewardsRolloutReadiness(providerId: string): Promise<Record<string, unknown>> {
  const { data } = await apiClient.get<{ data: Record<string, unknown> }>("/v1/crm/loyalty/rollout-readiness", {
    query: { provider_id: providerId },
  });
  return (data || {}) as Record<string, unknown>;
}

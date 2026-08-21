import { supabase } from "@/integrations/supabase/client";

export interface RewardsBackfillDryRunParams {
  providerId: string;
  fromCompletedAt?: string | null;
  toCompletedAt?: string | null;
  limit?: number;
}

export async function dryRunRewardsBackfill(params: RewardsBackfillDryRunParams): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc("dry_run_rewards_backfill", {
    p_provider_id: params.providerId,
    p_from_completed_at: params.fromCompletedAt ?? undefined,
    p_to_completed_at: params.toCompletedAt ?? undefined,
    p_limit: params.limit ?? 500,
  });
  if (error) throw new Error(error.message);
  return (data || {}) as Record<string, unknown>;
}

export async function getRewardsRolloutReadiness(providerId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc("get_rewards_rollout_readiness", { p_provider_id: providerId });
  if (error) throw new Error(error.message);
  return (data || {}) as Record<string, unknown>;
}

import { supabase } from "@/integrations/supabase/client";

export interface ExecuteRewardsBackfillBatchParams {
  providerId: string;
  actorId: string;
  fromCompletedAt?: string | null;
  toCompletedAt?: string | null;
  limit?: number;
  resumeAfterAppointmentId?: string | null;
}

export async function executeRewardsBackfillBatch(params: ExecuteRewardsBackfillBatchParams): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc("execute_rewards_backfill_batch", {
    p_provider_id: params.providerId,
    p_actor_id: params.actorId,
    p_from_completed_at: params.fromCompletedAt ?? undefined,
    p_to_completed_at: params.toCompletedAt ?? undefined,
    p_limit: params.limit ?? 100,
    p_resume_after_appointment_id: params.resumeAfterAppointmentId ?? undefined,
  });
  if (error) throw new Error(error.message);
  return (data || {}) as Record<string, unknown>;
}

import { supabase } from "@/integrations/supabase/client";

export interface RewardsCorrectionResult {
  status: string;
  reason?: string;
  correction_id?: string;
  event_id?: string;
  reward_instance_id?: string;
  previous_points_balance?: number;
  new_points_balance?: number;
  idempotent?: boolean;
  result?: unknown;
}

export async function adjustLoyaltyPoints(params: {
  providerId: string;
  customerId: string;
  pointsDelta: number;
  reasonCode: string;
  actorId: string;
  reasonNote?: string | null;
  appointmentId?: string | null;
  idempotencyKey?: string | null;
}): Promise<RewardsCorrectionResult> {
  const { data, error } = await supabase.rpc("adjust_loyalty_points", {
    p_provider_id: params.providerId,
    p_customer_id: params.customerId,
    p_points_delta: params.pointsDelta,
    p_reason_code: params.reasonCode,
    p_actor_id: params.actorId,
    p_reason_note: params.reasonNote ?? undefined,
    p_appointment_id: params.appointmentId ?? undefined,
    p_idempotency_key: params.idempotencyKey ?? undefined,
  });
  if (error) throw new Error(error.message);
  return (data || { status: "skipped", reason: "empty_response" }) as unknown as RewardsCorrectionResult;
}

export async function cancelLoyaltyRewardInstance(params: {
  rewardInstanceId: string;
  reasonCode: string;
  actorId: string;
  reasonNote?: string | null;
}): Promise<RewardsCorrectionResult> {
  const { data, error } = await supabase.rpc("cancel_loyalty_reward_instance", {
    p_reward_instance_id: params.rewardInstanceId,
    p_reason_code: params.reasonCode,
    p_actor_id: params.actorId,
    p_reason_note: params.reasonNote ?? undefined,
  });
  if (error) throw new Error(error.message);
  return (data || { status: "skipped", reason: "empty_response" }) as unknown as RewardsCorrectionResult;
}

export async function overrideLoyaltyRewardExpiration(params: {
  rewardInstanceId: string;
  expiresAt: string | null;
  reasonCode: string;
  actorId: string;
  reasonNote?: string | null;
}): Promise<RewardsCorrectionResult> {
  const { data, error } = await supabase.rpc("override_loyalty_reward_expiration", {
    p_reward_instance_id: params.rewardInstanceId,
    p_expires_at: params.expiresAt ?? undefined,
    p_reason_code: params.reasonCode,
    p_actor_id: params.actorId,
    p_reason_note: params.reasonNote ?? undefined,
  });
  if (error) throw new Error(error.message);
  return (data || { status: "skipped", reason: "empty_response" }) as unknown as RewardsCorrectionResult;
}

export async function retryAppointmentRewardsApplication(params: {
  appointmentId: string;
  reasonCode: string;
  actorId: string;
  reasonNote?: string | null;
}): Promise<RewardsCorrectionResult> {
  const { data, error } = await supabase.rpc("retry_appointment_rewards_application", {
    p_appointment_id: params.appointmentId,
    p_reason_code: params.reasonCode,
    p_actor_id: params.actorId,
    p_reason_note: params.reasonNote ?? undefined,
  });
  if (error) throw new Error(error.message);
  return (data || { status: "skipped", reason: "empty_response" }) as unknown as RewardsCorrectionResult;
}

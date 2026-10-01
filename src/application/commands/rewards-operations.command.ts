import { apiClient } from "@/lib/api-client";

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

// actorId is kept in each params signature but the actor is derived from the
// auth token server-side.

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
  const { data } = await apiClient.post<{ data: RewardsCorrectionResult }>("/v1/crm/loyalty/points/adjust", {
    provider_id: params.providerId,
    customer_id: params.customerId,
    points_delta: params.pointsDelta,
    reason_code: params.reasonCode,
    reason_note: params.reasonNote ?? null,
    appointment_id: params.appointmentId ?? null,
    idempotency_key: params.idempotencyKey ?? null,
  });
  return data || { status: "skipped", reason: "empty_response" };
}

export async function cancelLoyaltyRewardInstance(params: {
  rewardInstanceId: string;
  reasonCode: string;
  actorId: string;
  reasonNote?: string | null;
}): Promise<RewardsCorrectionResult> {
  const { data } = await apiClient.post<{ data: RewardsCorrectionResult }>("/v1/crm/loyalty/reward-instances/cancel", {
    reward_instance_id: params.rewardInstanceId,
    reason_code: params.reasonCode,
    reason_note: params.reasonNote ?? null,
  });
  return data || { status: "skipped", reason: "empty_response" };
}

export async function overrideLoyaltyRewardExpiration(params: {
  rewardInstanceId: string;
  expiresAt: string | null;
  reasonCode: string;
  actorId: string;
  reasonNote?: string | null;
}): Promise<RewardsCorrectionResult> {
  const { data } = await apiClient.post<{ data: RewardsCorrectionResult }>(
    "/v1/crm/loyalty/reward-instances/override-expiration",
    {
      reward_instance_id: params.rewardInstanceId,
      expires_at: params.expiresAt ?? null,
      reason_code: params.reasonCode,
      reason_note: params.reasonNote ?? null,
    },
  );
  return data || { status: "skipped", reason: "empty_response" };
}

export async function retryAppointmentRewardsApplication(params: {
  appointmentId: string;
  reasonCode: string;
  actorId: string;
  reasonNote?: string | null;
}): Promise<RewardsCorrectionResult> {
  const { data } = await apiClient.post<{ data: RewardsCorrectionResult }>("/v1/crm/loyalty/appointments/retry", {
    appointment_id: params.appointmentId,
    reason_code: params.reasonCode,
    reason_note: params.reasonNote ?? null,
  });
  return data || { status: "skipped", reason: "empty_response" };
}

import { apiClient } from "@/lib/api-client";

export interface ExecuteRewardsBackfillBatchParams {
  providerId: string;
  actorId: string;
  fromCompletedAt?: string | null;
  toCompletedAt?: string | null;
  limit?: number;
  resumeAfterAppointmentId?: string | null;
}

export async function executeRewardsBackfillBatch(params: ExecuteRewardsBackfillBatchParams): Promise<Record<string, unknown>> {
  // actorId is kept in the signature but the actor is derived from the auth
  // token server-side.
  const { data } = await apiClient.post<{ data: Record<string, unknown> }>("/v1/crm/loyalty/backfill/execute", {
    provider_id: params.providerId,
    from_completed_at: params.fromCompletedAt ?? null,
    to_completed_at: params.toCompletedAt ?? null,
    limit: params.limit ?? 100,
    resume_after_appointment_id: params.resumeAfterAppointmentId ?? null,
  });
  return data || {};
}

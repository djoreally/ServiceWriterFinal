import { apiClient } from "@/lib/api-client";

type RetentionEventInsert = {
  event_name: string;
  aggregate_type: string;
  aggregate_id: string;
  user_id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  payload_jsonb: Record<string, unknown>;
  occurred_at: string;
};

export async function insertRetentionEvents(rows: RetentionEventInsert[]): Promise<void> {
  if (rows.length === 0) return;
  // user_id is re-derived from the auth token server-side; the row field is
  // kept in the signature for compatibility.
  await apiClient.post("/v1/crm/retention/events", rows);
}

export async function retryQueuedEmail(emailQueueId: string): Promise<void> {
  await apiClient.patch(`/v1/crm/retention/email-queue/${emailQueueId}/retry`, {});
}

export async function invokeRetentionWorker(_userId: string): Promise<unknown> {
  const { data } = await apiClient.post<{ data: unknown }>("/v1/crm/retention/worker/invoke", {
    scope: "verify_today",
  });
  return data ?? null;
}

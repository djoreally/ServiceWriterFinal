/**
 * Provider Sync Query — Read operations for the payment-provider sync pipeline.
 * Backed by the `provider-sync-manager` edge function, proxied through the
 * platform API so the client never holds edge-function auth details.
 */
import { apiClient } from "@/lib/api-client";

export interface ProviderSyncSummary {
  total: number;
  pending: number;
  processing: number;
  succeeded: number;
  failed: number;
  dead_letter: number;
  stripe: number;
  square: number;
}

export interface ProviderSyncRecord {
  id: string;
  appointment_id: string;
  payment_record_id: string | null;
  provider: "stripe" | "square";
  sync_mode: "appointment_created" | "payment_pending" | "payment_succeeded" | "manual_resync";
  sync_status: "pending" | "processing" | "succeeded" | "failed" | "throttled";
  attempt_count: number;
  last_error: string | null;
  dead_letter: boolean;
  external_invoice_id: string | null;
  external_order_id: string | null;
  external_payment_id: string | null;
  external_customer_id: string | null;
  last_attempt_at: string | null;
  next_retry_at: string | null;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProviderSyncLog {
  id: string;
  attempt_number: number;
  status: "started" | "succeeded" | "failed" | "skipped" | "throttled";
  error_message: string | null;
  duration_ms: number | null;
  context: Record<string, unknown>;
  created_at: string;
}

export async function fetchProviderSyncSummary(): Promise<ProviderSyncSummary> {
  return apiClient.get("/v1/platform/provider-sync/summary");
}

export async function fetchProviderSyncRecords(
  options: { status?: string; limit?: number } = {},
): Promise<ProviderSyncRecord[]> {
  const query: Record<string, string | number> = {};
  if (options.status) query.status = options.status;
  if (options.limit) query.limit = options.limit;
  const data = await apiClient.get<{ records?: ProviderSyncRecord[] }>(
    "/v1/platform/provider-sync/records",
    { query },
  );
  return data.records || [];
}

export async function fetchProviderSyncLogs(recordId: string): Promise<ProviderSyncLog[]> {
  const data = await apiClient.get<{ logs?: ProviderSyncLog[] }>(
    "/v1/platform/provider-sync/logs",
    { query: { record_id: recordId } },
  );
  return data.logs || [];
}

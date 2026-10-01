/**
 * Provider Sync Manager Commands — Retry actions on the sync pipeline.
 * Proxied through the platform API; edge-function auth stays server-side.
 */
import { apiClient } from "@/lib/api-client";

async function postManager(body: Record<string, unknown>) {
  return apiClient.post<{ retried?: number; [key: string]: unknown }>(
    "/v1/platform/provider-sync/manage",
    body,
  );
}

export async function retryProviderSyncRecord(recordId: string) {
  return postManager({ action: "retry", record_id: recordId });
}

export async function retryAllFailedProviderSyncs() {
  return postManager({ action: "retry_all_failed" });
}

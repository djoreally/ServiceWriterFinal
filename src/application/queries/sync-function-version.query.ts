import { apiClient } from "@/lib/api-client";
/**
 * Hits the public GET probe of the `sync-appointment-to-provider` edge function
 * (proxied through the platform API).
 * Used by the AppointmentSyncCard so we can confirm the deployed function
 * matches the source we expect before re-running a sync.
 */
export interface SyncFunctionVersion {
  ok: boolean;
  function: string;
  version: string;
  built_at: string;
  capabilities: Record<string, unknown>;
}

export async function fetchSyncFunctionVersion(): Promise<SyncFunctionVersion> {
  return apiClient.get("/v1/platform/provider-sync/function-version");
}

import { SUPABASE_PUBLISHABLE_KEY_RESOLVED, SUPABASE_URL_RESOLVED } from "@/integrations/supabase/client";
/**
 * Hits the public GET probe of the `sync-appointment-to-provider` edge function.
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
  const url = `${SUPABASE_URL_RESOLVED}/functions/v1/sync-appointment-to-provider`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY_RESOLVED,
    },
  });
  if (!res.ok) {
    throw new Error(`Version probe failed (${res.status})`);
  }
  return res.json();
}

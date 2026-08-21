import { SUPABASE_URL_RESOLVED } from "@/integrations/supabase/client";
/**
 * Provider Sync Manager Commands — Retry actions on the sync pipeline.
 */
import { supabase } from "@/integrations/supabase/client";

async function postManager(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  const res = await fetch(
    `${SUPABASE_URL_RESOLVED}/functions/v1/provider-sync-manager`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

export async function retryProviderSyncRecord(recordId: string) {
  return postManager({ action: "retry", record_id: recordId });
}

export async function retryAllFailedProviderSyncs() {
  return postManager({ action: "retry_all_failed" });
}

import { SUPABASE_URL_RESOLVED } from "@/integrations/supabase/client";
/**
 * Provider Sync Query — Read operations for the payment-provider sync pipeline.
 * Backed by the `provider-sync-manager` edge function.
 */
import { supabase } from "@/integrations/supabase/client";

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

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  return { Authorization: `Bearer ${session.access_token}` };
}

export async function fetchProviderSyncSummary(): Promise<ProviderSyncSummary> {
  const headers = await authHeaders();
  const url = `${SUPABASE_URL_RESOLVED}/functions/v1/provider-sync-manager?action=summary`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Failed to load sync summary (${res.status})`);
  return res.json();
}

export async function fetchProviderSyncRecords(
  options: { status?: string; limit?: number } = {},
): Promise<ProviderSyncRecord[]> {
  const headers = await authHeaders();
  const params = new URLSearchParams({ action: "list" });
  if (options.status) params.set("status", options.status);
  if (options.limit) params.set("limit", String(options.limit));
  const url = `${SUPABASE_URL_RESOLVED}/functions/v1/provider-sync-manager?${params}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Failed to load sync records (${res.status})`);
  const data = await res.json();
  return data.records || [];
}

export async function fetchProviderSyncLogs(recordId: string): Promise<ProviderSyncLog[]> {
  const headers = await authHeaders();
  const params = new URLSearchParams({ action: "logs", record_id: recordId });
  const url = `${SUPABASE_URL_RESOLVED}/functions/v1/provider-sync-manager?${params}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Failed to load sync logs (${res.status})`);
  const data = await res.json();
  return data.logs || [];
}

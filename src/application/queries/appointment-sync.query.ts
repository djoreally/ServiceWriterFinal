import { SUPABASE_URL_RESOLVED } from "@/integrations/supabase/client";
/**
 * Appointment-scoped provider sync queries.
 * Used by the AppointmentSyncCard to hydrate initial state and
 * to fetch logs for the attempt-history dialog.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ProviderSyncRecord, ProviderSyncLog } from "./provider-sync.query";

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  return { Authorization: `Bearer ${session.access_token}` };
}

export async function fetchAppointmentSyncRecords(
  appointmentId: string,
): Promise<ProviderSyncRecord[]> {
  const headers = await authHeaders();
  const url = `${SUPABASE_URL_RESOLVED}/functions/v1/provider-sync-manager?action=for_appointment&appointment_id=${encodeURIComponent(appointmentId)}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Failed to load appointment sync (${res.status})`);
  const data = await res.json();
  return (data.records || []) as ProviderSyncRecord[];
}

export async function fetchAppointmentSyncLogs(
  recordId: string,
): Promise<ProviderSyncLog[]> {
  const headers = await authHeaders();
  const url = `${SUPABASE_URL_RESOLVED}/functions/v1/provider-sync-manager?action=logs&record_id=${encodeURIComponent(recordId)}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Failed to load logs (${res.status})`);
  const data = await res.json();
  return (data.logs || []) as ProviderSyncLog[];
}

export function subscribeAppointmentSyncChannel(
  appointmentId: string,
  onChange: () => void,
): () => void {
  const channel = supabase
    .channel(`appointment-sync:${appointmentId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "payment_provider_records",
        filter: `appointment_id=eq.${appointmentId}`,
      },
      () => { onChange(); },
    )
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

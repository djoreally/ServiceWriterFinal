/**
 * Appointment-scoped provider sync queries.
 * Used by the AppointmentSyncCard to hydrate initial state and
 * to fetch logs for the attempt-history dialog.
 *
 * Phase 2: edge-function reads go through the sanctioned appointments-router
 * proxy endpoints instead of direct fetch calls. Exported signatures are
 * unchanged. The realtime subscription stays on the browser client.
 */
import { apiClient } from "@/lib/api-client";
import { supabase } from "@/integrations/supabase/client";
import type { ProviderSyncRecord, ProviderSyncLog } from "./provider-sync.query";

export async function fetchAppointmentSyncRecords(
  appointmentId: string,
): Promise<ProviderSyncRecord[]> {
  const response = await apiClient.get<{ data: { records?: ProviderSyncRecord[] } | null; error: unknown }>(
    `/v1/appointments/${encodeURIComponent(appointmentId)}/provider-sync`,
  );
  if (response.error) throw new Error("Failed to load appointment sync");
  return (response.data?.records || []) as ProviderSyncRecord[];
}

export async function fetchAppointmentSyncLogs(
  recordId: string,
): Promise<ProviderSyncLog[]> {
  const response = await apiClient.get<{ data: { logs?: ProviderSyncLog[] } | null; error: unknown }>(
    "/v1/appointments/provider-sync-logs",
    { query: { record_id: recordId } },
  );
  if (response.error) throw new Error("Failed to load logs");
  return (response.data?.logs || []) as ProviderSyncLog[];
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

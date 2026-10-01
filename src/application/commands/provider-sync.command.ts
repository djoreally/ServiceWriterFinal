import { apiClient } from "@/lib/api-client";
import { supabase } from "@/integrations/supabase/client";

export type ProviderSyncMode = "appointment_created" | "payment_pending" | "payment_succeeded" | "manual_resync";
export type ProviderSyncName = "stripe" | "square";

export interface RequestAppointmentProviderSyncParams {
  appointmentId: string;
  paymentRecordId?: string | null;
  provider?: ProviderSyncName | null;
  syncMode: ProviderSyncMode;
  externalPaymentId?: string | null;
  externalOrderId?: string | null;
  externalTransactionId?: string | null;
  guestEmail?: string | null;
}

export async function requestAppointmentProviderSync(
  params: RequestAppointmentProviderSyncParams,
): Promise<{ data: unknown; error: Error | null }> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return { data: null, error: new Error("You must be signed in to sync this appointment.") };
    }

    const json = await apiClient.post<Record<string, unknown>>(
      "/v1/platform/provider-sync/request",
      {
        appointment_id: params.appointmentId,
        payment_record_id: params.paymentRecordId ?? null,
        provider: params.provider ?? null,
        sync_mode: params.syncMode,
        external_payment_id: params.externalPaymentId ?? null,
        external_order_id: params.externalOrderId ?? null,
        external_transaction_id: params.externalTransactionId ?? null,
        guest_email: params.guestEmail ?? null,
      },
    );

    return { data: json, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error contacting sync service";
    return { data: null, error: new Error(message) };
  }
}

/** Manual "Sync this appointment" — forces a fresh push using a separate manual_resync record. */
export async function triggerManualAppointmentSync(appointmentId: string) {
  return requestAppointmentProviderSync({
    appointmentId,
    syncMode: "manual_resync",
  });
}

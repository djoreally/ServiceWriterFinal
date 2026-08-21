import { SUPABASE_PUBLISHABLE_KEY_RESOLVED, SUPABASE_URL_RESOLVED, supabase } from "@/integrations/supabase/client";

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
  // Use a direct fetch (not supabase.functions.invoke) so we can:
  //   1. Guarantee the request method is POST
  //   2. Read the JSON error body the edge function returns (invoke swallows it)
  //   3. Surface an actionable message in the UI toast
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return { data: null, error: new Error("You must be signed in to sync this appointment.") };
    }

    const url = `${SUPABASE_URL_RESOLVED}/functions/v1/sync-appointment-to-provider`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: SUPABASE_PUBLISHABLE_KEY_RESOLVED,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        appointment_id: params.appointmentId,
        payment_record_id: params.paymentRecordId ?? null,
        provider: params.provider ?? null,
        sync_mode: params.syncMode,
        external_payment_id: params.externalPaymentId ?? null,
        external_order_id: params.externalOrderId ?? null,
        external_transaction_id: params.externalTransactionId ?? null,
        guest_email: params.guestEmail ?? null,
      }),
    });

    const json = await res.json().catch(() => ({} as Record<string, unknown>));

    if (!res.ok) {
      const message =
        (typeof json.error === "string" && json.error) ||
        `Sync failed (HTTP ${res.status})`;
      return { data: null, error: new Error(message) };
    }

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
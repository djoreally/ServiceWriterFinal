/**
 * Appointment Payments Query — Read operations for canonical payment records on appointments.
 */
import { supabase } from "@/integrations/supabase/client";

export interface AppointmentPaymentRow {
  id: string;
  amount: number;
  subtotal: number | null;
  tax_amount: number | null;
  status: string;
  payment_type: string;
  customer_email: string | null;
  customer_name: string | null;
  stripe_payment_intent_id: string | null;
  created_at: string;
  updated_at: string;
  invoice_sent_at: string | null;
}

type CanonicalPaymentRow = {
  id: string;
  amount: number | string;
  status: string;
  provider: string | null;
  provider_payment_id: string | null;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown> | null;
};

/** Fetch canonical payment rows whose metadata binds them to this appointment. */
export async function fetchAppointmentPayments(appointmentId: string): Promise<AppointmentPaymentRow[]> {
  const { data, error } = await supabase
    .from("payments")
    .select("id,amount,status,provider,provider_payment_id,created_at,updated_at,metadata")
    .contains("metadata", { appointment_id: appointmentId })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return ((data || []) as unknown as CanonicalPaymentRow[]).map((row) => {
    const metadata = row.metadata ?? {};
    const cents = Math.round(Number(row.amount || 0) * 100);
    return {
      id: row.id,
      amount: cents,
      subtotal: typeof metadata.subtotal_cents === "number" ? metadata.subtotal_cents : null,
      tax_amount: typeof metadata.tax_amount_cents === "number" ? metadata.tax_amount_cents : null,
      status: row.status,
      payment_type: typeof metadata.payment_type === "string" ? metadata.payment_type : row.provider ?? "payment",
      customer_email: typeof metadata.customer_email === "string" ? metadata.customer_email : null,
      customer_name: typeof metadata.customer_name === "string" ? metadata.customer_name : null,
      stripe_payment_intent_id: row.provider === "stripe" ? row.provider_payment_id : null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      invoice_sent_at: typeof metadata.invoice_sent_at === "string" ? metadata.invoice_sent_at : null,
    };
  });
}

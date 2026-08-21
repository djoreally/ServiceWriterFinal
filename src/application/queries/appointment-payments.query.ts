/**
 * Appointment Payments Query — Read operations for payment records on appointments.
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

/**
 * Fetch payment records for a specific appointment.
 */
export async function fetchAppointmentPayments(appointmentId: string): Promise<AppointmentPaymentRow[]> {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("appointment_id", appointmentId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as unknown as AppointmentPaymentRow[];
}

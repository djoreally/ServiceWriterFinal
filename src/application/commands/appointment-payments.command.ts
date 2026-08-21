/**
 * Appointment Payments Commands — Write operations for payment records on appointments.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
/** Create a pending payment record for an appointment. */
export async function createAppointmentPaymentRecord(params: {
  appointmentId: string;
  amountCents: number;
  subtotalCents: number;
  taxCents: number | null;
  taxRate: number | null;
  customerEmail?: string | null;
  customerName: string | null;
}): Promise<{ id: string; amount: number; subtotal: number | null; tax_amount: number | null; currency: string; customer_name: string | null }> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase.from("payment_records").insert({
    user_id: user.id,
    appointment_id: params.appointmentId,
    amount: params.amountCents,
    subtotal: params.subtotalCents,
    tax_amount: params.taxCents,
    tax_rate: params.taxRate,
    status: "pending",
    payment_type: "pay_at_service",
    customer_email: params.customerEmail ?? null,
    customer_name: params.customerName,
  }).select("id, amount, subtotal, tax_amount, currency, customer_name").single();
  if (error) throw error;
  return data;
}

/** Send a payment link for a pending payment record. */
export async function sendAppointmentPaymentLink(params: {
  paymentId: string;
  customerEmail: string | null;
  customerName: string | null;
}): Promise<{ url: string; emailSent: boolean }> {
  const { data, error } = await supabase.functions.invoke("create-invoice-payment-link", {
    body: {
      payment_id: params.paymentId,
      customer_email: params.customerEmail,
      customer_name: params.customerName,
    },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  await supabase
    .from("payment_records")
    .update({ invoice_sent_at: new Date().toISOString() })
    .eq("id", params.paymentId);

  return { url: data.url, emailSent: !!data.email_sent };
}

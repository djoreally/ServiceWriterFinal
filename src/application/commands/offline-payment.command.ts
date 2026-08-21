/**
 * Offline Payment Command — Processes queued offline payments
 */

import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export async function processOfflinePayment(payment: {
  amount: number;
  currency: string;
  customer_name: string | null;
  customer_email: string | null;
  appointment_id: string | null;
  payment_type: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}) {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase.from("payment_records").insert({
    user_id: user.id,
    amount: payment.amount,
    currency: payment.currency,
    customer_name: payment.customer_name,
    customer_email: payment.customer_email,
    appointment_id: payment.appointment_id,
    payment_type: payment.payment_type,
    status: "pending",
    metadata: {
      ...payment.metadata,
      queued_at: payment.created_at,
      processed_at: new Date().toISOString(),
      offline_queue: true,
    },
  });

  if (error) throw error;
}

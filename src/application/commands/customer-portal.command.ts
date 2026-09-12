/**
 * Customer Portal Commands — Write operations for the customer-facing portal.
 */
import { supabase } from "@/integrations/supabase/client";

/** Reschedule an appointment owned by the authenticated customer. */
export async function rescheduleAppointment(
  appointmentId: string,
  newDate: string,
  newTime: string,
): Promise<{ success: boolean; message?: string }> {
  const { data, error } = await supabase.rpc("reschedule_customer_portal_appointment_v1", {
    p_appointment_id: appointmentId,
    p_new_date: newDate,
    p_new_time: newTime,
  });

  if (error) throw error;

  const result = data as Record<string, unknown> | null;
  if (result?.success === false) {
    return { success: false, message: result.message as string };
  }
  return { success: true };
}


export async function cancelCustomerPortalAppointment(
  appointmentId: string,
  reason?: string,
): Promise<{ success: boolean; message?: string }> {
  const { data, error } = await supabase.rpc("cancel_customer_portal_appointment_v1", {
    p_appointment_id: appointmentId,
    p_cancellation_reason: reason || undefined,
  });
  if (error) throw error;
  const result = data as Record<string, unknown> | null;
  return result?.success === false
    ? { success: false, message: result.message as string }
    : { success: true };
}

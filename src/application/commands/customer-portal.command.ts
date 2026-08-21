/**
 * Customer Portal Commands — Write operations for the customer-facing portal.
 */
import { supabase } from "@/integrations/supabase/client";

/** Reschedule an appointment by management token. */
export async function rescheduleAppointment(
  managementToken: string,
  newDate: string,
  newTime: string,
): Promise<{ success: boolean; message?: string }> {
  const { data, error } = await supabase.rpc("reschedule_appointment_by_token", {
    p_management_token: managementToken,
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

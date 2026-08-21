/**
 * Appointment Services Commands — Write operations for appointment service line items.
 * Extracted from appointment-services.query.ts to enforce command/query separation.
 */
import { supabase } from "@/integrations/supabase/client";

export async function removeAppointmentService(serviceId: string): Promise<void> {
  const { error } = await supabase
    .from("appointment_services")
    .delete()
    .eq("id", serviceId);

  if (error) throw new Error("Failed to remove service");
}

/**
 * Edit appointment command - inline update from dialog
 */
import { supabase } from "@/integrations/supabase/client";

export interface EditAppointmentPayload {
  title: string;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  status: string;
  notes: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  estimated_cost: number;
  location_address?: string | null;
  customer_city?: string | null;
  customer_state?: string | null;
  customer_postal_code?: string | null;
}

export async function editAppointment(appointmentId: string, payload: EditAppointmentPayload): Promise<void> {
  const { error } = await supabase
    .from("appointments")
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", appointmentId);
  if (error) throw new Error(error.message);
}

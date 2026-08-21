import { supabase } from "@/integrations/supabase/client";
import type { AppointmentBookingConfiguration } from "@/lib/booking-configuration";

export async function fetchAppointmentBookingConfiguration(appointmentId: string): Promise<AppointmentBookingConfiguration | null> {
  const { data, error } = await (supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{ data: { configuration: AppointmentBookingConfiguration } | null; error: { message: string } | null }>;
        };
      };
    };
  }).from("appointment_booking_configurations").select("configuration").eq("appointment_id", appointmentId).maybeSingle();
  if (error) throw error;
  return data?.configuration ?? null;
}

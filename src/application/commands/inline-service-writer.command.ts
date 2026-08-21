/**
 * Inline Service Writer Commands — Write operations for the Command Center.
 */
import { supabase } from "@/integrations/supabase/client";
import { requestAppointmentProviderSync } from "./provider-sync.command";

/** Create a new customer (quick-create from inline writer) */
export async function createInlineCustomer(userId: string, data: { name: string; email: string | null; phone: string | null }) {
  return supabase
    .from("customers")
    .insert({ user_id: userId, name: data.name, email: data.email, phone: data.phone })
    .select("id")
    .single();
}

/** Create an appointment from the inline writer */
export async function createInlineAppointment(data: {
  user_id: string;
  title: string;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  customer_id: string | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  location_address: string | null;
  estimated_cost: number;
  job_priority: string;
  notes: string | null;
  status: string;
  source: string;
  service_catalog_id: string | null;
}) {
  const result = await supabase.from("appointments").insert(data).select("id").single();

  if (!result.error && result.data?.id) {
    requestAppointmentProviderSync({
      appointmentId: result.data.id,
      syncMode: "appointment_created",
      guestEmail: data.guest_email,
    }).catch((error) => {
      console.warn("[createInlineAppointment] provider sync failed", error);
    });
  }

  return result;
}

/** Batch insert appointment service line items */
export async function insertAppointmentServiceItems(
  items: Array<{
    appointment_id: string;
    service_catalog_id: string;
    name: string;
    price: number;
    quantity: number;
  }>
) {
  return supabase.from("appointment_services").insert(items);
}

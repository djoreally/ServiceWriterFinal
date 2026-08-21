/**
 * Appointment Service Queries
 * Abstracts service catalog lookups and appointment_services CRUD.
 */
import { supabase } from "@/integrations/supabase/client";

/** Fetch active service catalog items for the current user */
export async function fetchActiveServiceCatalog() {
  return supabase
    .from("service_catalog")
    .select("id, name, description, default_price")
    .eq("is_active", true)
    .order("name");
}

/** Insert a new appointment service line item */
export async function insertAppointmentService(data: {
  appointment_id: string;
  service_catalog_id: string | null;
  name: string;
  description: string | null;
  price: number;
  quantity: number;
  is_prepaid: boolean;
  added_at_service: boolean;
}) {
  return supabase
    .from("appointment_services")
    .insert(data)
    .select()
    .single();
}

/** Update an existing appointment service line item */
export async function updateAppointmentService(
  id: string,
  data: {
    appointment_id: string;
    service_catalog_id: string | null;
    name: string;
    description: string | null;
    price: number;
    quantity: number;
    is_prepaid: boolean;
    added_at_service: boolean;
  }
) {
  return supabase
    .from("appointment_services")
    .update(data)
    .eq("id", id)
    .select()
    .single();
}

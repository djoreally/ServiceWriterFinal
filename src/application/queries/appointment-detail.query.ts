/**
 * Appointment Detail Query — Read operations for the AppointmentDetail page.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser as resolveCurrentAuthUser } from "@/lib/auth/current-user";

/** Get the current authenticated user. */
export async function getCurrentAuthUser() {
  const { data: { user } } = await resolveCurrentAuthUser();
  return user;
}

/** Fetch a single appointment with all related data. */
export async function fetchAppointmentWithRelations(id: string, userId: string) {
  return supabase
    .from("appointments")
    .select("*, customer:customers(*), vehicle:vehicles(*), service_catalog:service_catalog(*), service_record_id")
    .eq("id", id)
    .eq("user_id", userId)
    .single();
}

/** Fetch vehicle specification data (oil type, capacity, engine). */
export async function fetchVehicleSpecs(make: string, model: string, year: string | number) {
  return supabase
    .from("vehicle_specifications")
    .select("oil_type, oil_capacity, engine")
    .eq("make", make)
    .eq("model", model)
    .eq("year", Number(year))
    .maybeSingle();
}

/** Fallback: look up customer contact details by guest email (scoped to business). */
export async function fetchCustomerAddressByGuestEmail(email: string, userId: string) {
  return supabase
    .from("customers")
    .select("address, phone")
    .eq("user_id", userId)
    .ilike("email", email)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}

/** Fetch succeeded payment records for an appointment. */
export async function fetchSucceededPayments(appointmentId: string) {
  return supabase
    .from("payment_records")
    .select("status, payment_type")
    .eq("appointment_id", appointmentId)
    .eq("status", "succeeded");
}

/** Fetch fee and surcharge settings for a business. */
export async function fetchAppointmentFeeSettings(userId: string) {
  return supabase
    .from("business_profiles")
    .select(
      "waste_oil_fee_enabled, waste_oil_fee, shop_fee_enabled, shop_fee_type, shop_fee_value, shop_fee_description, surcharge_enabled, surcharge_type, surcharge_value, surcharge_description, tax_rate",
    )
    .eq("user_id", userId)
    .single();
}

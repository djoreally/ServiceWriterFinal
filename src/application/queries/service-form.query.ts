/**
 * Service Record Form Query — Abstracts lookups for service record creation
 */

import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export async function getAuthUser() {
  const { data: { user } } = await getCurrentAuthUser();
  return user;
}

export async function fetchServiceFormOptions() {
  return Promise.all([
    supabase.from("customers").select("id, name, email, phone").order("name"),
    supabase.from("service_catalog").select("id, name, description, default_price, labor_rate, estimated_duration").eq("is_active", true).order("name"),
  ]);
}

export async function findVehicleByVin(userId: string, vin: string) {
  return supabase.from("vehicles").select("id").eq("user_id", userId).eq("vin", vin).maybeSingle();
}

export async function upsertBookingVehicle(params: {
  p_business_user_id: string;
  p_customer_id: string | null;
  p_year: number;
  p_make: string;
  p_model: string;
  p_vin: string | null;
  p_engine: string | null;
}) {
  return supabase.rpc("upsert_booking_vehicle", params);
}

export async function upsertCustomerRpc(userId: string, email: string, name: string, phone: string | null) {
  return supabase.rpc("upsert_customer", {
    p_user_id: userId,
    p_email: email,
    p_name: name,
    p_phone: phone,
  });
}

export async function updateServiceRecord(serviceId: string, data: Record<string, unknown>) {
  return supabase.from("services").update(data as never).eq("id", serviceId);
}

/**
 * Fleet Vehicle Profile — Data access for the fleet vehicle profile page.
 */
import { supabase } from "@/integrations/supabase/client";

export async function fetchFleetVehicleProfile(vehicleId: string) {
  return supabase
    .from("fleet_vehicles")
    .select("*, fleet_clients(id, company_name), fleet_locations(id, name), fleet_contracts(id, name)")
    .eq("id", vehicleId)
    .single();
}

export async function fetchFleetVehicleWorkOrders(vehicleId: string) {
  return supabase
    .from("fleet_work_orders")
    .select("id, order_number, status, service_type, scheduled_date, total, completed_at")
    .eq("fleet_vehicle_id", vehicleId)
    .order("created_at", { ascending: false });
}

export async function fetchVehicleSpecMatch(year: number, make: string, model: string) {
  return supabase
    .from("vehicle_specifications")
    .select("*")
    .eq("year", year)
    .ilike("make", make)
    .ilike("model", `%${model}%`)
    .limit(1)
    .maybeSingle();
}

export type VehicleSpecificationUpsert = {
  id?: string;
  year: number;
  make: string;
  model: string;
  engine?: string | null;
  oil_capacity?: string | null;
  oil_type?: string | null;
  oil_filter?: string | null;
  air_filter?: string | null;
  cabin_filter?: string | null;
  fuel_filter?: string | null;
  brake_fluid?: string | null;
  coolant_type?: string | null;
  transmission_fluid?: string | null;
  tire_size?: string | null;
  wiper_blade_driver?: string | null;
  wiper_blade_passenger?: string | null;
  wiper_blade_rear?: string | null;
};

export async function saveVehicleSpecification(payload: VehicleSpecificationUpsert) {
  const { id, ...spec } = payload;

  if (id) {
    return supabase
      .from("vehicle_specifications")
      .update({ ...spec, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
  }

  return supabase
    .from("vehicle_specifications")
    .insert({ ...spec, source: "manual" })
    .select("*")
    .single();
}

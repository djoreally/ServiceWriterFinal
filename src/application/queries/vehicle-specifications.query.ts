/**
 * Vehicle Specifications Query
 * Fetches vehicle spec data from the vehicle_specifications table.
 */

import { supabase } from "@/integrations/supabase/client";

export interface VehicleSpec {
  id: string;
  year: number;
  make: string;
  model: string;
  engine: string | null;
  oil_type: string | null;
  oil_capacity: string | null;
  air_filter: string | null;
  oil_filter: string | null;
  cabin_filter: string | null;
  fuel_filter: string | null;
  wiper_blade_driver: string | null;
  wiper_blade_passenger: string | null;
  transmission_fluid: string | null;
  coolant_type: string | null;
  tire_size: string | null;
}

export async function fetchVehicleSpecifications(year: number, make: string, model: string): Promise<VehicleSpec[]> {
  const { data, error } = await supabase
    .from("vehicle_specifications")
    .select("*")
    .eq("year", year)
    .ilike("make", `%${make}%`)
    .ilike("model", `%${model}%`)
    .limit(5);

  if (error || !data) return [];
  return data as VehicleSpec[];
}

/**
 * Exact-match spec lookup (no wildcard) used by the VehicleDetail page.
 * Returns every spec variant for the YMM so an admin can disambiguate engine/oil.
 */
export async function fetchExactVehicleSpecifications(
  year: number,
  make: string,
  model: string,
  columns: string = "engine,oil_type,oil_capacity,tire_size,additional_specs",
): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await supabase
    .from("vehicle_specifications")
    .select(columns)
    .eq("year", year)
    .ilike("make", make)
    .ilike("model", model);
  if (error || !data) return [];
  return data as unknown as Array<Record<string, unknown>>;
}



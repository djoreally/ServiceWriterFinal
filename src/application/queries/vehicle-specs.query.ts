/**
 * Vehicle Specs Query — Abstracts vehicle specification lookups
 */

import { supabase } from "../../integrations/supabase/client";
import type { Database } from "../../integrations/supabase/types";

export type VehicleSpecRow = Database["public"]["Tables"]["vehicle_specifications"]["Row"];

export interface AIVehicleSpecsResponse {
  year: number;
  make: string;
  model: string;
  engines: string[];
  specs: Record<
    string,
    {
      oil_type: string | null;
      oil_capacity: string | null;
      transmission_fluid: string | null;
      oil_plug_torque: string | null;
    }
  >;
  source: "cache" | "ai";
  confidence_score?: number;
}

export async function fetchVehicleSpecYears() {
  return supabase.rpc("get_vehicle_spec_years");
}

export async function fetchVehicleSpecMakes(selectedYear: number) {
  return supabase.rpc("get_vehicle_spec_makes", { selected_year: selectedYear });
}

export async function fetchVehicleSpecModels(selectedYear: number, selectedMake: string) {
  return supabase.rpc("get_vehicle_spec_models", {
    selected_year: selectedYear,
    selected_make: selectedMake,
  });
}

export async function fetchVehicleSpecEngines(year: number, make: string, model: string) {
  return supabase
    .from("vehicle_specifications")
    .select("*")
    .eq("year", year)
    .ilike("make", make)
    .ilike("model", model)
    .limit(20);
}

export async function fetchVehicleSpecSingle(year: number, make: string, model: string, engine?: string) {
  let query = supabase
    .from("vehicle_specifications")
    .select("*")
    .eq("year", year)
    .ilike("make", make)
    .ilike("model", model);

  if (engine) {
    query = query.ilike("engine", engine);
  }

  return query.limit(1);
}

export async function invokeAIVehicleSpecs(year: number, make: string, model: string) {
  return supabase.functions.invoke<AIVehicleSpecsResponse>("ai-vehicle-specs", {
    body: { year, make, model },
  });
}

/**
 * Vehicle Parts Query — Lookup matching filter/part data for a vehicle.
 * Uses the filter_applications table via the lookup_vehicle_parts RPC.
 */
import { supabase } from "@/integrations/supabase/client";

export interface VehiclePart {
  filter_type: string;
  brand: string;
  part_number: string;
  part_number_alt: string | null;
  oem_number: string | null;
  engine: string | null;
  notes: string | null;
}

/** Look up all matching parts for a vehicle by year/make/model. */
export async function lookupVehicleParts(
  year: number,
  make: string,
  model: string,
): Promise<VehiclePart[]> {
  const { data, error } = await supabase.rpc("lookup_vehicle_parts", {
    p_year: year,
    p_make: make,
    p_model: model,
  });

  if (error) {
    console.error("Error looking up vehicle parts:", error);
    return [];
  }

  return (data as VehiclePart[]) || [];
}

/** Filter type labels for display. */
export const FILTER_TYPE_LABELS: Record<string, string> = {
  oil: "Oil Filter",
  air: "Engine Air Filter",
  cabin: "Cabin Air Filter",
  fuel: "Fuel Filter",
  transmission: "Transmission Filter",
  hydraulic: "Hydraulic Filter",
  pcv: "PCV Valve",
  breather: "Breather Filter",
};

/** Service name patterns that map to required filter types. */
export const SERVICE_FILTER_MAP: Record<string, string> = {
  "oil change": "oil",
  "oil service": "oil",
  "engine air filter": "air",
  "air filter": "air",
  "cabin air filter": "cabin",
  "cabin filter": "cabin",
};

/**
 * Given a list of selected service names, determine which filter types are required.
 */
export function getRequiredFilterTypes(serviceNames: string[]): string[] {
  const required = new Set<string>();
  for (const name of serviceNames) {
    const lower = name.toLowerCase();
    for (const [pattern, filterType] of Object.entries(SERVICE_FILTER_MAP)) {
      if (lower.includes(pattern)) {
        required.add(filterType);
      }
    }
  }
  return Array.from(required);
}

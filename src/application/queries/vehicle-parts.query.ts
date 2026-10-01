/**
 * Vehicle Parts Query — Lookup matching filter/part data for a vehicle.
 * Uses the filter_applications table via the lookup_vehicle_parts RPC.
 */
import { apiClient } from "@/lib/api-client";

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
  try {
    const { data } = await apiClient.post<{ data: VehiclePart[] }>("/v1/vehicle-parts/lookup", {
      year,
      make,
      model,
    });
    return data || [];
  } catch (error) {
    console.error("Error looking up vehicle parts:", error);
    return [];
  }
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

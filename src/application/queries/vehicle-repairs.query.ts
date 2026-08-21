/**
 * Vehicle Repairs Query
 * Wraps the vehicle-repairs Edge Function to fetch vehicle-specific part costs and labor ranges.
 */

import { supabase } from "@/integrations/supabase/client";

export interface RepairCostDetail {
  name: "part" | "labor" | "total";
  average: number;
  high: number;
  low: number;
}

export interface RepairItem {
  title: string;
  description: string;
  costs: {
    independent: RepairCostDetail[];
    dealer: RepairCostDetail[];
  };
}

export interface VehicleRepairsResponse {
  success: boolean;
  source: "cache" | "upstream";
  vehicle: {
    vin: string;
    year: number;
    make: string;
    model: string;
  };
  repair: RepairItem[];
  error?: string;
}

/** Indicates that the external pricing service cannot currently provide data. */
export class VehicleRepairsUnavailableError extends Error {
  constructor() {
    super("Repair pricing data is temporarily unavailable.");
    this.name = "VehicleRepairsUnavailableError";
  }
}

const indicatesServiceUnavailability = (message: string) =>
  /quota|rate.?limit|temporar|unavailable|service.?down|not configured|upstream/i.test(message);

/**
 * Fetch repair items, descriptions, part costs, and labor estimates for a 17-character VIN.
 *
 * The public caller receives a typed, generic failure only. Raw provider errors are retained
 * in server-side logs, not surfaced to customers or browser consoles.
 */
export async function fetchVehicleRepairs(vin: string, businessId?: string): Promise<VehicleRepairsResponse> {
  if (!vin || vin.length !== 17) {
    throw new Error("A valid 17-character VIN is required for repair estimation.");
  }

  const { data, error } = await supabase.functions.invoke("vehicle-repairs", {
    body: { vin, businessId },
  });

  if (error) {
    throw new VehicleRepairsUnavailableError();
  }

  if (!data || data.success === false) {
    const detail = typeof data?.error === "string" ? data.error : "";
    if (indicatesServiceUnavailability(detail)) throw new VehicleRepairsUnavailableError();
    throw new Error("No repair estimates are available for this vehicle.");
  }

  return data as VehicleRepairsResponse;
}

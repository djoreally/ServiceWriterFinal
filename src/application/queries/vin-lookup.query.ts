/**
 * VIN Lookup Query
 * Wraps the quickvin-lookup Edge Function.
 */

import { supabase } from "@/integrations/supabase/client";

export interface VinLookupResult {
  vin: string;
  make: string;
  model: string;
  year: number;
  trim?: string;
  engine?: string;
  bodyStyle?: string;
}

export async function lookupVin(licensePlate: string, state: string): Promise<VinLookupResult> {
  const { data, error } = await supabase.functions.invoke("carfax-quickvin", {
    body: { licensePlate, state },
  });

  if (error) throw error;

  if (data?.success && data.vehicle) {
    return {
      vin: data.vehicle.vin,
      make: data.vehicle.make,
      model: data.vehicle.model,
      year: data.vehicle.year,
      trim: data.vehicle.trim,
      engine: data.vehicle.engine,
      bodyStyle: data.vehicle.bodyStyle,
    };
  }

  throw new Error(data?.error || "Vehicle not found");
}

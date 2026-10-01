/**
 * VIN Lookup Query
 * Wraps the quickvin-lookup provider endpoint.
 */

import { apiClient, ApiClientError } from "@/lib/api-client";

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
  let data: Record<string, any> | null;
  try {
    const response = await apiClient.post<{ data: Record<string, any> | null }>("/v1/vin/plate-lookup", {
      licensePlate,
      state,
    });
    data = response.data;
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw new Error(error.message || "Vehicle not found");
    }
    throw error;
  }

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

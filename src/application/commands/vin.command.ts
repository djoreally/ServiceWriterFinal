/**
 * VIN scanning & decoding commands - wraps provider endpoints
 */
import { apiClient } from "@/lib/api-client";

export interface VinDecodeResult {
  vin: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  engine: string | null;
  transmission: string | null;
  driveType: string | null;
  fuelType: string | null;
  bodyClass: string | null;
  filters?: Array<{
    filterType: string;
    brand: string;
    partNumber: string;
    crossReferences?: Array<{ brand: string; partNumber: string }>;
  }>;
  oilSpecs?: {
    oilType: string | null;
    oilCapacity: string | null;
    oilFilter: string | null;
  };
  vehicleSpecs?: {
    airFilter: string | null;
    cabinFilter: string | null;
    transmissionFluid: string | null;
  };
}

/** Send a base64 JPEG to the vin-ocr provider */
export async function ocrVinFromImage(imageBase64: string): Promise<{ success: boolean; vin?: string; error?: string }> {
  const { data } = await apiClient.post<{ data: { success: boolean; vin?: string; error?: string } }>("/v1/vin/ocr", {
    imageBase64,
  });
  return data;
}

/** Decode a VIN via the vin-decode provider */
export async function decodeVinNumber(vin: string): Promise<VinDecodeResult> {
  const { data } = await apiClient.post<{ data: VinDecodeResult }>("/v1/vin/decode", { vin });
  return data;
}

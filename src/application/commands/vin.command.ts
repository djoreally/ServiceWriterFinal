/**
 * VIN scanning & decoding commands - wraps edge functions
 */
import { supabase } from "@/integrations/supabase/client";

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

/** Send a base64 JPEG to the vin-ocr edge function */
export async function ocrVinFromImage(imageBase64: string): Promise<{ success: boolean; vin?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke("vin-ocr", {
    body: { imageBase64 },
  });
  if (error) throw error;
  return data;
}

/** Decode a VIN via the vin-decode edge function */
export async function decodeVinNumber(vin: string): Promise<VinDecodeResult> {
  const { data, error } = await supabase.functions.invoke("vin-decode", {
    body: { vin },
  });
  if (error) throw error;
  return data;
}

/**
 * Vehicle Specs Page Query — Abstracts data access for VehicleSpecs page.
 * Separates DB/edge-function calls from UI logic.
 */
import { supabase } from "@/integrations/supabase/client";

/** Count total vehicle specifications records. */
export async function countVehicleSpecs() {
  return supabase.from("vehicle_specifications").select("*", { count: "exact", head: true });
}

/** Count total filter application records. */
export async function countFilterApplications() {
  return supabase.from("filter_applications").select("*", { count: "exact", head: true });
}

/** Search vehicle specifications by year/make/model. */
export async function searchVehicleSpecs(year?: number, make?: string, model?: string) {
  let query = supabase.from("vehicle_specifications").select("*");
  if (year) query = query.eq("year", year);
  if (make) query = query.ilike("make", make);
  if (model) query = query.ilike("model", `%${model}%`);
  return query.order("year", { ascending: false }).limit(100);
}

/** Decode a VIN via edge function. */
export async function decodeVin(vin: string): Promise<any> {
  return supabase.functions.invoke("vin-decode", { body: { vin: vin.toUpperCase() } });
}

/** Search filter cross-references by part number. */
export async function searchFilterCrossRefs(partNumber: string) {
  return supabase
    .from("filter_cross_references")
    .select("*")
    .or(`source_part_number.ilike.%${partNumber}%,target_part_number.ilike.%${partNumber}%`)
    .limit(50);
}

/** Invoke vehicle-maintenance edge function. */
export async function fetchMaintenanceSchedule(body: Record<string, unknown>): Promise<any> {
  return supabase.functions.invoke("vehicle-maintenance", { body });
}

/** Invoke quickvin-lookup edge function (plate decoder). */
export async function decodePlate(licensePlate: string, state: string): Promise<any> {
  return supabase.functions.invoke("quickvin-lookup", {
    body: { licensePlate, state },
  });
}

/** Invoke ymmt-specs edge function for TWB data. */
export async function fetchYmmtSpecs(body: Record<string, unknown>): Promise<any> {
  return supabase.functions.invoke("ymmt-specs", { body });
}

/** Invoke seed-vehicle-specs edge function with a chunk. */
export async function seedVehicleSpecsChunk(specs: unknown[]): Promise<any> {
  return supabase.functions.invoke("seed-vehicle-specs", { body: { specs } });
}

/** Invoke seed-filters edge function. */
export async function seedFilters(body: unknown): Promise<any> {
  return supabase.functions.invoke("seed-filters", { body });
}

/**
 * Vehicle Specs Query — public booking vehicle lookups.
 *
 * Year/make/model options come from the read-only public-vehicle-catalog edge
 * function. The catalog uses NHTSA for YMM choices and ServiceWriter's existing
 * vehicles + vehicle_service_specs records for any known service specifications.
 * No AI lookup is used by this path.
 */

import { supabase } from "../../integrations/supabase/client";
import type { Json } from "../../integrations/supabase/types";

export interface VehicleSpecRow {
  id?: string;
  year: number;
  make: string;
  model: string;
  engine: string | null;
  oil_type: string | null;
  oil_capacity: string | null;
  oil_filter?: string | null;
  transmission_fluid: string | null;
  additional_specs: Json | null;
}

type CatalogError = { message: string };
type CatalogResult<T> = Promise<{ data: T | null; error: CatalogError | null }>;

async function invokeCatalog<T>(body: Record<string, unknown>): CatalogResult<T> {
  const { data, error } = await supabase.functions.invoke<T>("public-vehicle-catalog", { body });
  if (error) return { data: null, error: { message: error.message || "Vehicle catalog lookup failed" } };
  return { data: data ?? null, error: null };
}

export async function fetchVehicleSpecYears() {
  const { data, error } = await invokeCatalog<{ years?: number[] }>({ action: "years" });
  return {
    data: error ? null : (data?.years ?? []).map((year) => ({ year })),
    error,
  };
}

export async function fetchVehicleSpecMakes(selectedYear: number) {
  const { data, error } = await invokeCatalog<{ makes?: string[] }>({ action: "makes", year: selectedYear });
  return {
    data: error ? null : (data?.makes ?? []).map((make) => ({ make })),
    error,
  };
}

export async function fetchVehicleSpecModels(selectedYear: number, selectedMake: string) {
  const { data, error } = await invokeCatalog<{ models?: string[] }>({
    action: "models",
    year: selectedYear,
    make: selectedMake,
  });
  return {
    data: error ? null : (data?.models ?? []).map((model) => ({ model })),
    error,
  };
}

export async function fetchVehicleSpecEngines(year: number, make: string, model: string) {
  const { data, error } = await invokeCatalog<{ rows?: VehicleSpecRow[] }>({ action: "specs", year, make, model });
  return { data: error ? null : data?.rows ?? [], error };
}

export async function fetchVehicleSpecSingle(year: number, make: string, model: string, engine?: string) {
  const { data, error } = await fetchVehicleSpecEngines(year, make, model);
  if (error) return { data: null, error };
  const rows = data ?? [];
  const match = engine
    ? rows.find((row) => (row.engine ?? "").localeCompare(engine, undefined, { sensitivity: "accent" }) === 0)
    : rows[0];
  return { data: match ? [match] : [], error: null };
}

/**
 * Legacy compatibility export. Public booking no longer uses AI vehicle specs.
 * Keeping the symbol temporarily avoids breaking any stale imports while making
 * accidental calls fail closed instead of invoking the retired AI function.
 */
export async function invokeAIVehicleSpecs(_year: number, _make: string, _model: string) {
  return {
    data: null,
    error: { message: "AI vehicle lookup has been retired. Use the vehicle catalog." },
  };
}

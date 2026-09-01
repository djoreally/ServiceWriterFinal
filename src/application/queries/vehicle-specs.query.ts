/**
 * Vehicle Specs Query — public booking vehicle lookups.
 *
 * Browser code talks only to Service Writer's same-origin API. The server owns
 * NHTSA/reference-data access, which avoids cross-origin Edge Function failures
 * and gives oil/tire consumers one canonical fitment contract.
 */

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
  tire_size?: string | null;
  rear_tire_size?: string | null;
  transmission_fluid: string | null;
  additional_specs: Json | null;
  source?: string;
}

type CatalogError = { message: string };
type CatalogResult<T> = Promise<{ data: T | null; error: CatalogError | null }>;

async function invokeCatalog<T>(body: Record<string, unknown>): CatalogResult<T> {
  try {
    const response = await fetch("/api/v1/public-vehicle-catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({})) as T & { error?: string };
    if (!response.ok) return { data: null, error: { message: payload.error || "Vehicle catalog lookup failed" } };
    return { data: payload, error: null };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : "Vehicle catalog lookup failed" } };
  }
}

export async function fetchVehicleSpecYears() {
  const { data, error } = await invokeCatalog<{ years?: number[] }>({ action: "years" });
  return { data: error ? null : (data?.years ?? []).map((year) => ({ year })), error };
}

export async function fetchVehicleSpecMakes(selectedYear: number) {
  const { data, error } = await invokeCatalog<{ makes?: string[] }>({ action: "makes", year: selectedYear });
  return { data: error ? null : (data?.makes ?? []).map((make) => ({ make })), error };
}

export async function fetchVehicleSpecModels(selectedYear: number, selectedMake: string) {
  const { data, error } = await invokeCatalog<{ models?: string[] }>({ action: "models", year: selectedYear, make: selectedMake });
  return { data: error ? null : (data?.models ?? []).map((model) => ({ model })), error };
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

/** Legacy compatibility export. Public booking never invokes an AI provider. */
export async function invokeAIVehicleSpecs(_year: number, _make: string, _model: string) {
  return { data: null, error: { message: "AI vehicle lookup has been retired. Use the vehicle catalog." } };
}

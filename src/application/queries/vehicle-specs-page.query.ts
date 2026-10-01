/**
 * Vehicle Specs Page Query — Abstracts data access for VehicleSpecs page.
 * Separates DB/edge-function calls from UI logic.
 */
import { apiClient, ApiClientError } from "@/lib/api-client";
import type { Database } from "@/integrations/supabase/types";

export interface VinDecodeData {
  year?: number | null;
  make?: string | null;
  model?: string | null;
  engine?: string | null;
  oilSpecs?: {
    oilType?: string | null;
    oilCapacity?: string | null;
  } | null;
}

type VehicleSpecificationRow = Database["public"]["Tables"]["vehicle_specifications"]["Row"];
type FilterCrossReferenceRow = Database["public"]["Tables"]["filter_cross_references"]["Row"];

type QueryResult<T> = { data: T | null; error: Error | null };

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error("Request failed");
}

/** Count total vehicle specifications records. */
export async function countVehicleSpecs(): Promise<{ count: number | null; data: unknown; error: Error | null }> {
  try {
    const { data } = await apiClient.get<{ data: { count: number } }>("/v1/vehicle-specs/count");
    return { count: data?.count ?? 0, data: [], error: null };
  } catch (error) {
    return { count: null, data: null, error: toError(error) };
  }
}

/** Count total filter application records. */
export async function countFilterApplications(): Promise<{ count: number | null; data: unknown; error: Error | null }> {
  try {
    const { data } = await apiClient.get<{ data: { count: number } }>("/v1/filter-applications/count");
    return { count: data?.count ?? 0, data: [], error: null };
  } catch (error) {
    return { count: null, data: null, error: toError(error) };
  }
}

/** Search vehicle specifications by year/make/model. */
export async function searchVehicleSpecs(year?: number, make?: string, model?: string): Promise<QueryResult<VehicleSpecificationRow[]>> {
  try {
    const { data } = await apiClient.get<{ data: VehicleSpecificationRow[] }>("/v1/vehicle-specs/search", {
      query: { year, make, model },
    });
    return { data: data ?? [], error: null };
  } catch (error) {
    return { data: null, error: toError(error) };
  }
}

/** Decode a VIN via provider endpoint. */
export async function decodeVin(vin: string): Promise<QueryResult<VinDecodeData>> {
  try {
    const { data } = await apiClient.post<{ data: VinDecodeData }>("/v1/vin/decode", { vin: vin.toUpperCase() });
    return { data: data ?? null, error: null };
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 501) {
      return { data: null, error: new Error("VIN decode provider is not configured") };
    }
    return { data: null, error: toError(error) };
  }
}

/** Search filter cross-references by part number. */
export async function searchFilterCrossRefs(partNumber: string): Promise<QueryResult<FilterCrossReferenceRow[]>> {
  try {
    const { data } = await apiClient.get<{ data: FilterCrossReferenceRow[] }>("/v1/filter-cross-refs/search", {
      query: { part_number: partNumber },
    });
    return { data: data ?? [], error: null };
  } catch (error) {
    return { data: null, error: toError(error) };
  }
}

/** Invoke vehicle-maintenance provider endpoint. */
export async function fetchMaintenanceSchedule(body: Record<string, unknown>): Promise<QueryResult<any>> {
  try {
    const { data } = await apiClient.post<{ data: any }>("/v1/vehicle-maintenance/schedule", body);
    return { data: data ?? null, error: null };
  } catch (error) {
    return { data: null, error: toError(error) };
  }
}

/** Invoke quickvin-lookup provider endpoint (plate decoder). */
export async function decodePlate(licensePlate: string, state: string): Promise<QueryResult<any>> {
  try {
    const { data } = await apiClient.post<{ data: any }>("/v1/vin/plate-lookup", { licensePlate, state });
    return { data: data ?? null, error: null };
  } catch (error) {
    return { data: null, error: toError(error) };
  }
}

/** Invoke ymmt-specs provider endpoint for TWB data. */
export async function fetchYmmtSpecs(body: Record<string, unknown>): Promise<QueryResult<any>> {
  try {
    const { data } = await apiClient.post<{ data: any }>("/v1/ymmt-specs", body);
    return { data: data ?? null, error: null };
  } catch (error) {
    return { data: null, error: toError(error) };
  }
}

/** Invoke seed-vehicle-specs provider endpoint with a chunk. */
export async function seedVehicleSpecsChunk(specs: unknown[]): Promise<QueryResult<any>> {
  try {
    const { data } = await apiClient.post<{ data: any }>("/v1/vehicle-specs/seed", { specs });
    return { data: data ?? null, error: null };
  } catch (error) {
    return { data: null, error: toError(error) };
  }
}

/** Invoke seed-filters provider endpoint. */
export async function seedFilters(body: unknown): Promise<QueryResult<any>> {
  try {
    const { data } = await apiClient.post<{ data: any }>("/v1/filter-applications/seed", body);
    return { data: data ?? null, error: null };
  } catch (error) {
    return { data: null, error: toError(error) };
  }
}

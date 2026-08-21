/**
 * Vehicle Filters Query — single source of truth for "which filter fits this vehicle".
 * Backed by resolve_vehicle_filters_v1 (shop-confirmed > FRAM catalogue > spec reference)
 * and resolve_oil_reset_procedure_v1 for the oil-life-monitor reset steps.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type FilterSource = "shop_confirmed" | "fram_catalogue" | "spec_reference";

export interface FilterSubstitute {
  brand: string;
  part_number: string;
  kind: "cross_reference" | "fram_tier";
  tier?: string;
}

export interface ResolvedVehicleFilter {
  part_category: string;
  part_number: string;
  brand: string;
  part_number_alt: string | null;
  oem_number: string | null;
  quantity: number;
  engine: string | null;
  source: FilterSource;
  confidence: number;
  substitutes: FilterSubstitute[];
}

export interface OilResetProcedure {
  make: string;
  model: string | null;
  trim_or_engine: string | null;
  method: string;
  steps: string[];
  notes: string | null;
}

export interface VehicleFilterLookup {
  year: number | null | undefined;
  make: string | null | undefined;
  model: string | null | undefined;
  engine?: string | null;
  vehicleKind?: "fleet" | "retail" | null;
  vehicleId?: string | null;
}

export const FILTER_CATEGORY_LABELS: Record<string, string> = {
  oil_filter: "Oil Filter",
  air_filter: "Engine Air Filter",
  cabin_filter: "Cabin Air Filter",
  fuel_filter: "Fuel Filter",
  transmission_filter: "Transmission Filter",
};

export const FILTER_SOURCE_LABELS: Record<FilterSource, string> = {
  shop_confirmed: "Shop confirmed",
  fram_catalogue: "FRAM catalogue",
  spec_reference: "Spec reference",
};

export function filterCategoryLabel(value: string): string {
  return FILTER_CATEGORY_LABELS[value] ?? value;
}

function normalizeSubstitutes(value: unknown): FilterSubstitute[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is FilterSubstitute =>
    !!row && typeof row === "object" && typeof (row as FilterSubstitute).part_number === "string",
  );
}

export async function resolveVehicleFilters(
  input: VehicleFilterLookup,
): Promise<ResolvedVehicleFilter[]> {
  if (!input.year || !input.make || !input.model) return [];

  const { data, error } = await (supabase as any).rpc("resolve_vehicle_filters_v1", {
    p_year: input.year,
    p_make: input.make,
    p_model: input.model,
    p_engine: input.engine || null,
    p_vehicle_kind: input.vehicleKind || null,
    p_vehicle_id: input.vehicleId || null,
  });

  if (error) throw new Error(error.message);

  return ((data ?? []) as ResolvedVehicleFilter[]).map((row) => ({
    ...row,
    quantity: Number(row.quantity ?? 1),
    confidence: Number(row.confidence ?? 0),
    substitutes: normalizeSubstitutes(row.substitutes),
  }));
}

export async function resolveOilResetProcedure(
  input: Pick<VehicleFilterLookup, "year" | "make" | "model">,
): Promise<OilResetProcedure | null> {
  if (!input.year || !input.make || !input.model) return null;

  const { data, error } = await (supabase as any).rpc("resolve_oil_reset_procedure_v1", {
    p_year: input.year,
    p_make: input.make,
    p_model: input.model,
  });

  if (error) throw new Error(error.message);
  const row = (data ?? [])[0] as OilResetProcedure | undefined;
  if (!row) return null;
  return { ...row, steps: Array.isArray(row.steps) ? row.steps : [] };
}

/** Reference data: cache aggressively, it never changes per user. */
const REFERENCE_CACHE = { staleTime: 60 * 60 * 1000, gcTime: 6 * 60 * 60 * 1000 };

export function useVehicleFilters(input: VehicleFilterLookup) {
  return useQuery({
    queryKey: [
      "vehicle-filters",
      input.year ?? null,
      (input.make ?? "").toLowerCase(),
      (input.model ?? "").toLowerCase(),
      (input.engine ?? "").toLowerCase(),
      input.vehicleKind ?? null,
      input.vehicleId ?? null,
    ],
    queryFn: () => resolveVehicleFilters(input),
    enabled: Boolean(input.year && input.make && input.model),
    ...REFERENCE_CACHE,
  });
}

export function useOilResetProcedure(input: Pick<VehicleFilterLookup, "year" | "make" | "model">) {
  return useQuery({
    queryKey: [
      "oil-reset-procedure",
      input.year ?? null,
      (input.make ?? "").toLowerCase(),
      (input.model ?? "").toLowerCase(),
    ],
    queryFn: () => resolveOilResetProcedure(input),
    enabled: Boolean(input.year && input.make && input.model),
    ...REFERENCE_CACHE,
  });
}

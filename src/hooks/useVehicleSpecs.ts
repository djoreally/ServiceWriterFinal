import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchVehicleSpecYears,
  fetchVehicleSpecMakes,
  fetchVehicleSpecModels,
  fetchVehicleSpecEngines,
  fetchVehicleSpecSingle,
  type VehicleSpecRow,
} from "@/application/queries/vehicle-specs.query";
import type { Json } from "@/integrations/supabase/types";

export interface VehicleSpec {
  id?: string;
  year: number;
  make: string;
  model: string;
  engine: string | null;
  oil_type: string | null;
  oil_capacity: string | null;
  oil_filter?: string | null;
  oil_plug_torque: string | null;
  tire_size?: string | null;
  rear_tire_size?: string | null;
  transmission_fluid: string | null;
  additional_specs?: Record<string, string | null> | null;
}

/** Retained only for stale imports. Public booking no longer performs AI lookups. */
export interface AIVehicleSpecResult {
  year: number;
  make: string;
  model: string;
  engines: string[];
  specs: Record<string, { oil_type: string | null; oil_capacity: string | null; transmission_fluid: string | null; oil_plug_torque: string | null }>;
  source: "cache" | "ai";
  confidence_score?: number;
}

export async function lookupVehicleSpecsWithAI(_year?: number, _make?: string, _model?: string): Promise<AIVehicleSpecResult> {
  throw new Error("AI vehicle lookup has been retired. Vehicle data comes from the vehicle catalog.");
}

interface UseVehicleSpecsOptions { year?: string; make?: string; model?: string }
type JsonRecord = { [key: string]: Json | undefined };

function isJsonRecord(value: Json | null): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toAdditionalSpecs(value: Json | null): Record<string, string | null> | null {
  if (!isJsonRecord(value)) return null;
  const result: Record<string, string | null> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === null) result[key] = null;
    else if (typeof entry === "string") result[key] = entry;
    else if (typeof entry === "number" || typeof entry === "boolean") result[key] = String(entry);
  }
  return Object.keys(result).length > 0 ? result : null;
}

function mapSpec(item: VehicleSpecRow): VehicleSpec {
  const additionalSpecs = toAdditionalSpecs(item.additional_specs) ?? {};
  if (item.oil_filter) additionalSpecs.oil_filter = item.oil_filter;
  if (item.tire_size) additionalSpecs.tire_size = item.tire_size;
  if (item.rear_tire_size) additionalSpecs.rear_tire_size = item.rear_tire_size;
  return {
    id: item.id,
    year: item.year,
    make: item.make,
    model: item.model,
    engine: item.engine,
    oil_type: item.oil_type,
    oil_capacity: item.oil_capacity,
    oil_filter: item.oil_filter ?? null,
    oil_plug_torque: additionalSpecs.oil_plug_torque || null,
    tire_size: item.tire_size ?? null,
    rear_tire_size: item.rear_tire_size ?? null,
    transmission_fluid: item.transmission_fluid,
    additional_specs: Object.keys(additionalSpecs).length ? additionalSpecs : null,
  };
}

export function useVehicleSpecs(options: UseVehicleSpecsOptions = {}) {
  const [years, setYears] = useState<number[]>([]);
  const [makes, setMakes] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [engines, setEngines] = useState<{ engine: string; spec: VehicleSpec }[]>([]);
  const [matchedSpec, setMatchedSpec] = useState<VehicleSpec | null>(null);
  const [yearsLoading, setYearsLoading] = useState(true);
  const [makesLoading, setMakesLoading] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [specsLoading, setSpecsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setYearsLoading(true);
    void fetchVehicleSpecYears().then(({ data }) => { if (!cancelled) setYears((data ?? []).map((row) => row.year)); })
      .finally(() => { if (!cancelled) setYearsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setMakes([]); setModels([]); setEngines([]); setMatchedSpec(null);
    if (!options.year) return () => { cancelled = true; };
    setMakesLoading(true);
    void fetchVehicleSpecMakes(Number(options.year)).then(({ data }) => { if (!cancelled) setMakes((data ?? []).map((row) => row.make)); })
      .finally(() => { if (!cancelled) setMakesLoading(false); });
    return () => { cancelled = true; };
  }, [options.year]);

  useEffect(() => {
    let cancelled = false;
    setModels([]); setEngines([]); setMatchedSpec(null);
    if (!options.year || !options.make) return () => { cancelled = true; };
    setModelsLoading(true);
    void fetchVehicleSpecModels(Number(options.year), options.make).then(({ data }) => { if (!cancelled) setModels((data ?? []).map((row) => row.model)); })
      .finally(() => { if (!cancelled) setModelsLoading(false); });
    return () => { cancelled = true; };
  }, [options.year, options.make]);

  useEffect(() => {
    let cancelled = false;
    setEngines([]); setMatchedSpec(null);
    if (!options.year || !options.make || !options.model) return () => { cancelled = true; };
    setSpecsLoading(true);
    void fetchVehicleSpecEngines(Number(options.year), options.make, options.model).then(({ data }) => {
      if (cancelled) return;
      const specs = (data ?? []).map(mapSpec);
      setEngines(specs.filter((spec) => spec.engine).map((spec) => ({ engine: spec.engine!, spec })));
      setMatchedSpec(specs[0] ?? null);
    }).finally(() => { if (!cancelled) setSpecsLoading(false); });
    return () => { cancelled = true; };
  }, [options.year, options.make, options.model]);

  return {
    loading: yearsLoading,
    yearsLoading, makesLoading, modelsLoading, specsLoading,
    years, makes, models, engines, matchedSpec,
    allSpecs: [] as VehicleSpec[],
    needsFallback: false,
  };
}

/** Legacy hook retained so stale imports compile; it never calls an AI provider. */
export function useAIVehicleSpecLookup() {
  const [error, setError] = useState<string | null>(null);
  const lookup = useCallback(async (_year?: number, _make?: string, _model?: string) => {
    const message = "AI vehicle lookup has been retired. Use the vehicle catalog.";
    setError(message);
    throw new Error(message);
  }, []);
  const reset = useCallback(() => setError(null), []);
  return { lookup, loading: false, result: null as AIVehicleSpecResult | null, error, reset };
}

export function useVehicleSpecLookup(year?: string, make?: string, model?: string, engine?: string) {
  const [spec, setSpec] = useState<VehicleSpec | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!year || !make || !model) { setSpec(null); return () => { cancelled = true; }; }
    setLoading(true);
    void fetchVehicleSpecSingle(Number(year), make, model, engine).then(({ data }) => { if (!cancelled) setSpec(data?.[0] ? mapSpec(data[0]) : null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [year, make, model, engine]);
  return useMemo(() => ({ spec, loading }), [spec, loading]);
}

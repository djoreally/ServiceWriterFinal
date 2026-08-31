import { useState, useEffect, useMemo, useCallback } from "react";
import {
  fetchVehicleSpecYears,
  fetchVehicleSpecMakes,
  fetchVehicleSpecModels,
  fetchVehicleSpecEngines,
  fetchVehicleSpecSingle,
  invokeAIVehicleSpecs,
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
  oil_plug_torque: string | null;
  transmission_fluid: string | null;
  additional_specs?: Record<string, string | null> | null;
}

// AI lookup result interface
export interface AIVehicleSpecResult {
  year: number;
  make: string;
  model: string;
  engines: string[];
  specs: Record<string, {
    oil_type: string | null;
    oil_capacity: string | null;
    transmission_fluid: string | null;
    oil_plug_torque: string | null;
  }>;
  source: "cache" | "ai";
  confidence_score?: number;
}

// AI lookup function - calls edge function
export async function lookupVehicleSpecsWithAI(
  year: number,
  make: string,
  model: string
): Promise<AIVehicleSpecResult> {
  const { data, error } = await invokeAIVehicleSpecs(year, make, model);

  if (error) {
    throw new Error(error.message || "AI lookup failed");
  }

  return data as AIVehicleSpecResult;
}

interface UseVehicleSpecsOptions {
  year?: string;
  make?: string;
  model?: string;
}

type VehicleSpecYearOption = { year: number };
type VehicleSpecMakeOption = { make: string };
type VehicleSpecModelOption = { model: string };
type JsonRecord = { [key: string]: Json | undefined };

function isJsonRecord(value: Json | null): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toAdditionalSpecs(value: Json | null): Record<string, string | null> | null {
  if (!isJsonRecord(value)) return null;

  const result: Record<string, string | null> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (entry === null) {
      result[key] = null;
      continue;
    }

    if (typeof entry === "string") {
      result[key] = entry;
      continue;
    }

    if (typeof entry === "number" || typeof entry === "boolean") {
      result[key] = String(entry);
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

function mapSpec(item: VehicleSpecRow): VehicleSpec {
  const additionalSpecs = toAdditionalSpecs(item.additional_specs);

  return {
    id: item.id,
    year: item.year,
    make: item.make,
    model: item.model,
    engine: item.engine,
    oil_type: item.oil_type,
    oil_capacity: item.oil_capacity,
    oil_plug_torque: additionalSpecs?.oil_plug_torque || null,
    transmission_fluid: item.transmission_fluid,
    additional_specs: additionalSpecs,
  };
}

/**
 * ⚡ Performance: Queries the database directly instead of fetching large JSON files.
 * This avoids CORS issues in preview and reduces initial page load by ~7MB.
 */
export function useVehicleSpecs(options: UseVehicleSpecsOptions = {}) {
  const [years, setYears] = useState<number[]>([]);
  const [makes, setMakes] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [engines, setEngines] = useState<{ engine: string; spec: VehicleSpec }[]>([]);
  const [matchedSpec, setMatchedSpec] = useState<VehicleSpec | null>(null);
  const [loading, setLoading] = useState(true);
  const [allSpecs, setAllSpecs] = useState<VehicleSpec[]>([]);

  // ⚡ Load distinct years via RPC — returns ~26 rows instead of 14k+
  useEffect(() => {
    const loadYears = async () => {
      setLoading(true);
      const { data, error } = await fetchVehicleSpecYears();
      if (!error && data) {
        setYears((data as VehicleSpecYearOption[]).map((d) => d.year));
      }
      setLoading(false);
    };
    loadYears();
  }, []);

  // ⚡ Load distinct makes via RPC — returns only unique makes for selected year
  useEffect(() => {
    if (!options.year) {
      void Promise.resolve().then(() => setMakes([]));
      return;
    }
    const loadMakes = async () => {
      const { data, error } = await fetchVehicleSpecMakes(parseInt(options.year!));
      if (!error && data) {
        setMakes((data as VehicleSpecMakeOption[]).map((d) => d.make));
      }
    };
    void Promise.resolve().then(() => loadMakes());
  }, [options.year]);

  // ⚡ Load distinct models via RPC — returns only unique models for year+make
  useEffect(() => {
    if (!options.year || !options.make) {
      void Promise.resolve().then(() => setModels([]));
      return;
    }
    const loadModels = async () => {
      const { data, error } = await fetchVehicleSpecModels(parseInt(options.year!), options.make!);
      if (!error && data) {
        setModels((data as VehicleSpecModelOption[]).map((d) => d.model));
      }
    };
    void Promise.resolve().then(() => loadModels());
  }, [options.year, options.make]);

  // Load engines + matched spec when model changes
  useEffect(() => {
    if (!options.year || !options.make || !options.model) {
      void Promise.resolve().then(() => setEngines([]));
      void Promise.resolve().then(() => setMatchedSpec(null));
      return;
    }
    const loadEngines = async () => {
      const { data, error } = await fetchVehicleSpecEngines(
        parseInt(options.year!),
        options.make!,
        options.model!
      );

      if (!error && data) {
        const specs: VehicleSpec[] = data.map(mapSpec);
        const engineList = specs
          .filter(s => s.engine)
          .map(s => ({ engine: s.engine!, spec: s }));
        setEngines(engineList);
        setMatchedSpec(specs[0] || null);
      }
    };
    void Promise.resolve().then(() => loadEngines());
  }, [options.year, options.make, options.model]);

  // Check if we need fallback for selected year
  const needsFallback = useMemo(() => {
    if (!options.year || loading) return false;
    return makes.length === 0;
  }, [options.year, makes, loading]);

  return {
    loading,
    years,
    makes,
    models,
    engines,
    matchedSpec,
    allSpecs,
    needsFallback,
  };
}

// Hook for AI-assisted vehicle spec lookup
export function useAIVehicleSpecLookup() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AIVehicleSpecResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lookup = useCallback(async (year: number, make: string, model: string) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await lookupVehicleSpecsWithAI(year, make, model);
      setResult(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI lookup failed";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { lookup, loading, result, error, reset };
}

export function useVehicleSpecLookup(year?: string, make?: string, model?: string, engine?: string) {
  const [spec, setSpec] = useState<VehicleSpec | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!year || !make || !model) {
      void Promise.resolve().then(() => setSpec(null));
      return;
    }

    void Promise.resolve().then(() => setLoading(true));

    const lookup = async () => {
      const { data, error } = await fetchVehicleSpecSingle(
        parseInt(year),
        make,
        model,
        engine
      );

      if (!error && data && data.length > 0) {
        setSpec(mapSpec(data[0]));
      } else {
        setSpec(null);
      }
      setLoading(false);
    };

    void Promise.resolve().then(() => lookup());
  }, [year, make, model, engine]);

  return { spec, loading };
}

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
});

const clean = (value: unknown, max = 120) => typeof value === "string" ? value.trim().slice(0, max) : "";
const currentYear = new Date().getUTCFullYear();

type CatalogRow = {
  id?: string;
  year: number;
  make: string;
  model: string;
  engine: string | null;
  oil_type: string | null;
  oil_capacity: string | null;
  oil_filter: string | null;
  transmission_fluid: string | null;
  additional_specs: Record<string, unknown>;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = clean(body?.action, 30);

    if (action === "years") {
      const years = Array.from({ length: currentYear + 2 - 1990 + 1 }, (_, index) => currentYear + 2 - index)
        .filter((year) => year >= 1990);
      return json({ years });
    }

    if (action === "makes") {
      const vehicleTypes = ["car", "truck", "multipurpose passenger vehicle (mpv)"];
      const responses = await Promise.all(vehicleTypes.map(async (type) => {
        const url = `https://vpic.nhtsa.dot.gov/api/vehicles/GetMakesForVehicleType/${encodeURIComponent(type)}?format=json`;
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) return [];
        const payload = await response.json();
        return Array.isArray(payload?.Results) ? payload.Results : [];
      }));
      const makes = Array.from(new Set(responses.flat().map((row: Record<string, unknown>) => clean(row.MakeName || row.Make_Name)).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b));
      return json({ makes });
    }

    if (action === "models") {
      const year = Number(body?.year);
      const make = clean(body?.make);
      if (!Number.isInteger(year) || year < 1990 || year > currentYear + 2 || !make) return json({ error: "Valid year and make are required" }, 400);
      const url = `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${year}?format=json`;
      const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) return json({ error: "Vehicle data provider unavailable" }, 502);
      const payload = await response.json();
      const models = Array.from(new Set((Array.isArray(payload?.Results) ? payload.Results : []).map((row: Record<string, unknown>) => clean(row.Model_Name || row.ModelName)).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b));
      return json({ models });
    }

    if (action === "specs") {
      const year = Number(body?.year);
      const make = clean(body?.make);
      const model = clean(body?.model);
      if (!Number.isInteger(year) || !make || !model) return json({ rows: [] });

      const url = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!url || !serviceKey) return json({ rows: [] });
      const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

      const { data: vehicleRows, error: vehicleError } = await client
        .from("vehicles")
        .select("id,metadata")
        .eq("year", year)
        .ilike("make", make)
        .ilike("model", model)
        .limit(100);
      if (vehicleError || !vehicleRows?.length) return json({ rows: [] });

      const ids = vehicleRows.map((row) => row.id);
      const { data: specRows, error: specError } = await client
        .from("vehicle_service_specs")
        .select("id,vehicle_id,engine,oil_type,oil_capacity,oil_filter,metadata")
        .in("vehicle_id", ids)
        .limit(100);
      if (specError) return json({ rows: [] });

      const rows: CatalogRow[] = [];
      for (const row of specRows || []) {
        const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
        rows.push({
          id: row.id,
          year,
          make,
          model,
          engine: clean(row.engine) || null,
          oil_type: clean(row.oil_type) || null,
          oil_capacity: clean(row.oil_capacity) || null,
          oil_filter: clean(row.oil_filter) || null,
          transmission_fluid: clean(metadata.transmission_fluid) || null,
          additional_specs: metadata,
        });
      }

      for (const vehicle of vehicleRows) {
        const metadata = vehicle.metadata && typeof vehicle.metadata === "object" ? vehicle.metadata as Record<string, unknown> : {};
        const engine = clean(metadata.engine);
        const oilType = clean(metadata.oil_type);
        const oilCapacity = clean(metadata.oil_capacity);
        const oilFilter = clean(metadata.oil_filter);
        const transmissionFluid = clean(metadata.transmission_fluid);
        if (!engine && !oilType && !oilCapacity && !oilFilter && !transmissionFluid) continue;
        rows.push({
          id: `vehicle:${vehicle.id}`,
          year,
          make,
          model,
          engine: engine || null,
          oil_type: oilType || null,
          oil_capacity: oilCapacity || null,
          oil_filter: oilFilter || null,
          transmission_fluid: transmissionFluid || null,
          additional_specs: metadata,
        });
      }

      const seen = new Set<string>();
      const deduped = rows.filter((row) => {
        const key = `${clean(row.engine)}|${clean(row.oil_type)}|${clean(row.oil_capacity)}|${clean(row.oil_filter)}`.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).sort((a, b) => (a.engine || "").localeCompare(b.engine || ""));

      return json({ rows: deduped });
    }

    return json({ error: "Unsupported action" }, 400);
  } catch (error) {
    console.error("public_vehicle_catalog_failed", error instanceof Error ? error.message : String(error));
    return json({ error: "Vehicle catalog lookup failed" }, 500);
  }
});

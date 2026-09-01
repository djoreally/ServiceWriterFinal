import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase";

const currentYear = new Date().getUTCFullYear();
const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("years") }),
  z.object({ action: z.literal("makes"), year: z.number().int().min(1981).max(currentYear + 2) }),
  z.object({ action: z.literal("models"), year: z.number().int().min(1981).max(currentYear + 2), make: z.string().trim().min(1).max(120) }),
  z.object({ action: z.literal("specs"), year: z.number().int().min(1981).max(currentYear + 2), make: z.string().trim().min(1).max(120), model: z.string().trim().min(1).max(160) }),
]);

type JsonRecord = Record<string, unknown>;
const clean = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const metaText = (metadata: unknown, key: string): string | null => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as JsonRecord)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

async function nhtsa(path: string) {
  const response = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/${path}${path.includes("?") ? "&" : "?"}format=json`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
    next: { revalidate: 86_400 },
  });
  if (!response.ok) throw new Error(`NHTSA lookup failed (${response.status})`);
  return response.json() as Promise<{ Results?: JsonRecord[] }>;
}

export async function POST(request: Request) {
  try {
    const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Invalid vehicle lookup request" }, { status: 400 });
    const input = parsed.data;

    if (input.action === "years") {
      return NextResponse.json({ years: Array.from({ length: currentYear + 2 - 1981 + 1 }, (_, index) => currentYear + 2 - index) });
    }

    if (input.action === "makes") {
      // vPIC does not expose a make-by-model-year endpoint. Return its normalized
      // light-vehicle make catalog after a year is selected; model lookup below is year-specific.
      const vehicleTypes = ["car", "truck", "multipurpose passenger vehicle (mpv)"];
      const payloads = await Promise.all(vehicleTypes.map((type) => nhtsa(`GetMakesForVehicleType/${encodeURIComponent(type)}`)));
      const makes = Array.from(new Set(payloads.flatMap((payload) => payload.Results ?? [])
        .map((row) => clean(row.MakeName ?? row.Make_Name)).filter(Boolean))).sort((a, b) => a.localeCompare(b));
      return NextResponse.json({ makes });
    }

    if (input.action === "models") {
      const payload = await nhtsa(`GetModelsForMakeYear/make/${encodeURIComponent(input.make)}/modelyear/${input.year}`);
      const models = Array.from(new Set((payload.Results ?? []).map((row) => clean(row.Model_Name ?? row.ModelName)).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b));
      return NextResponse.json({ models });
    }

    const admin = createSupabaseAdminClient();
    const { data: vehicles, error: vehicleError } = await admin
      .from("vehicles")
      .select("id,metadata")
      .eq("year", input.year)
      .ilike("make", input.make)
      .ilike("model", input.model)
      .limit(100);
    if (vehicleError) throw vehicleError;

    const vehicleIds = (vehicles ?? []).map((vehicle) => vehicle.id);
    const serviceSpecs = vehicleIds.length
      ? await admin.from("vehicle_service_specs")
          .select("id,vehicle_id,engine,oil_type,oil_capacity,oil_filter,metadata")
          .in("vehicle_id", vehicleIds)
          .limit(100)
      : { data: [], error: null };
    if (serviceSpecs.error) throw serviceSpecs.error;

    const rows: Array<Record<string, unknown>> = [];
    for (const spec of serviceSpecs.data ?? []) {
      rows.push({
        id: spec.id,
        year: input.year,
        make: input.make,
        model: input.model,
        engine: spec.engine ?? null,
        oil_type: spec.oil_type ?? null,
        oil_capacity: spec.oil_capacity ?? null,
        oil_filter: spec.oil_filter ?? null,
        tire_size: metaText(spec.metadata, "tire_size"),
        rear_tire_size: metaText(spec.metadata, "rear_tire_size"),
        transmission_fluid: metaText(spec.metadata, "transmission_fluid"),
        additional_specs: spec.metadata && typeof spec.metadata === "object" ? spec.metadata : {},
        source: "vehicle_service_specs",
      });
    }

    for (const vehicle of vehicles ?? []) {
      const engine = metaText(vehicle.metadata, "engine");
      const oilType = metaText(vehicle.metadata, "oil_type");
      const oilCapacity = metaText(vehicle.metadata, "oil_capacity");
      const oilFilter = metaText(vehicle.metadata, "oil_filter");
      const tireSize = metaText(vehicle.metadata, "tire_size");
      if (!engine && !oilType && !oilCapacity && !oilFilter && !tireSize) continue;
      rows.push({
        year: input.year,
        make: input.make,
        model: input.model,
        engine,
        oil_type: oilType,
        oil_capacity: oilCapacity,
        oil_filter: oilFilter,
        tire_size: tireSize,
        rear_tire_size: metaText(vehicle.metadata, "rear_tire_size"),
        transmission_fluid: metaText(vehicle.metadata, "transmission_fluid"),
        additional_specs: vehicle.metadata ?? {},
        source: "vehicle_metadata",
      });
    }

    const seen = new Set<string>();
    const deduped = rows.filter((row) => {
      const key = [row.engine, row.oil_type, row.oil_capacity, row.oil_filter, row.tire_size, row.rear_tire_size].map((value) => clean(value)).join("|").toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return NextResponse.json({ rows: deduped }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch (error) {
    console.error("public_vehicle_catalog_api_failed", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "Vehicle catalog lookup failed" }, { status: 502 });
  }
}

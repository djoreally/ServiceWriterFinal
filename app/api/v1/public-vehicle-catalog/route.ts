import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";

const currentYear = new Date().getUTCFullYear();
const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("years") }),
  z.object({ action: z.literal("makes"), year: z.number().int().min(1990).max(currentYear + 2) }),
  z.object({ action: z.literal("models"), year: z.number().int().min(1990).max(currentYear + 2), make: z.string().trim().min(1).max(120) }),
  z.object({ action: z.literal("specs"), year: z.number().int().min(1990).max(currentYear + 2), make: z.string().trim().min(1).max(120), model: z.string().trim().min(1).max(160) }),
]);

const VEHICLE_SPEC_FILE = path.join(
  process.cwd(),
  "data/vehicle-catalog-staging/vehicle_specifications_import_eligible_verified.csv",
);

interface VehicleCatalogRow {
  record_id: string;
  year: number;
  make: string;
  model: string;
  engine: string | null;
  oil_type: string | null;
  oil_capacity: string | null;
  oil_filter: string | null;
  transmission_fluid: string | null;
  source: string;
  additional_specs: Record<string, unknown>;
}

interface VehicleCatalogIndex {
  years: number[];
  makesByYear: Map<number, string[]>;
  modelsByYearMake: Map<string, string[]>;
  specsByYmm: Map<string, VehicleCatalogRow[]>;
}

let catalogPromise: Promise<VehicleCatalogIndex> | null = null;

const normalize = (value: string) => value.trim().toLowerCase();
const ymmKey = (year: number, make: string, model?: string) =>
  [String(year), normalize(make), model ? normalize(model) : ""].join("|");

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function nullable(value: string | undefined): string | null {
  const cleaned = value?.trim() ?? "";
  return cleaned.length > 0 ? cleaned : null;
}

function parseAdditionalSpecs(value: string | undefined): Record<string, unknown> {
  if (!value?.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

async function loadCatalog(): Promise<VehicleCatalogIndex> {
  const text = await readFile(VEHICLE_SPEC_FILE, "utf8");
  const parsed = parseCsv(text);
  const header = parsed.shift();
  if (!header) throw new Error("Vehicle specification catalog is empty");

  const column = new Map(header.map((name, index) => [name.trim(), index]));
  const required = ["record_id", "year", "make", "model", "engine", "oil_type", "oil_capacity", "oil_filter", "transmission_fluid", "source", "additional_specs"];
  for (const name of required) {
    if (!column.has(name)) throw new Error(`Vehicle specification catalog missing ${name}`);
  }

  const rows: VehicleCatalogRow[] = [];
  for (const values of parsed) {
    const year = Number(values[column.get("year")!]);
    const make = values[column.get("make")!]?.trim() ?? "";
    const model = values[column.get("model")!]?.trim() ?? "";
    if (!Number.isInteger(year) || !make || !model) continue;

    rows.push({
      record_id: values[column.get("record_id")!]?.trim() ?? "",
      year,
      make,
      model,
      engine: nullable(values[column.get("engine")!]),
      oil_type: nullable(values[column.get("oil_type")!]),
      oil_capacity: nullable(values[column.get("oil_capacity")!]),
      oil_filter: nullable(values[column.get("oil_filter")!]),
      transmission_fluid: nullable(values[column.get("transmission_fluid")!]),
      source: values[column.get("source")!]?.trim() ?? "consolidated",
      additional_specs: parseAdditionalSpecs(values[column.get("additional_specs")!]),
    });
  }

  const years = Array.from(new Set(rows.map((row) => row.year))).sort((a, b) => b - a);
  const makes = new Map<number, Set<string>>();
  const models = new Map<string, Set<string>>();
  const specsByYmm = new Map<string, VehicleCatalogRow[]>();

  for (const row of rows) {
    if (!makes.has(row.year)) makes.set(row.year, new Set());
    makes.get(row.year)!.add(row.make);

    const makeKey = ymmKey(row.year, row.make);
    if (!models.has(makeKey)) models.set(makeKey, new Set());
    models.get(makeKey)!.add(row.model);

    const specKey = ymmKey(row.year, row.make, row.model);
    const group = specsByYmm.get(specKey) ?? [];
    group.push(row);
    specsByYmm.set(specKey, group);
  }

  return {
    years,
    makesByYear: new Map(Array.from(makes, ([year, values]) => [year, Array.from(values).sort((a, b) => a.localeCompare(b))])),
    modelsByYearMake: new Map(Array.from(models, ([key, values]) => [key, Array.from(values).sort((a, b) => a.localeCompare(b))])),
    specsByYmm,
  };
}

function getCatalog() {
  catalogPromise ??= loadCatalog().catch((error) => {
    catalogPromise = null;
    throw error;
  });
  return catalogPromise;
}

export async function POST(request: Request) {
  try {
    const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Invalid vehicle lookup request" }, { status: 400 });
    const input = parsed.data;
    const catalog = await getCatalog();

    if (input.action === "years") {
      return NextResponse.json({ years: catalog.years }, { headers: { "Cache-Control": "public, s-maxage=86400" } });
    }

    if (input.action === "makes") {
      return NextResponse.json({ makes: catalog.makesByYear.get(input.year) ?? [] }, { headers: { "Cache-Control": "public, s-maxage=86400" } });
    }

    if (input.action === "models") {
      return NextResponse.json({ models: catalog.modelsByYearMake.get(ymmKey(input.year, input.make)) ?? [] }, { headers: { "Cache-Control": "public, s-maxage=86400" } });
    }

    const rows = (catalog.specsByYmm.get(ymmKey(input.year, input.make, input.model)) ?? []).map((row) => ({
      id: row.record_id || undefined,
      year: row.year,
      make: row.make,
      model: row.model,
      engine: row.engine,
      oil_type: row.oil_type,
      oil_capacity: row.oil_capacity,
      oil_filter: row.oil_filter,
      tire_size: null,
      rear_tire_size: null,
      transmission_fluid: row.transmission_fluid,
      additional_specs: row.additional_specs,
      source: row.source,
    }));

    return NextResponse.json({ rows }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch (error) {
    console.error("public_vehicle_catalog_api_failed", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "Vehicle catalog lookup failed" }, { status: 502 });
  }
}

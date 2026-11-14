/**
 * QLD spec provider — the live catalog tier for spec resolution.
 *
 * Doctrine (owner, 2026-11-05): Quick Lube Data is the single spec
 * source; Service Writer is its first integration; specs arrive by
 * LIVE lookup. The emv-era `vehicle_specifications` snapshot is not
 * the source — callers keep it only as a legacy fallback under this
 * tier, and nothing new reads from it.
 *
 * This module is the Service Writer adapter over the resolver in
 * ./resolver, which owns the actual translation between SW's
 * stored strings and QLD's exact-match contract (canonicalize via
 * QLD's hierarchy, resolve the engine from hints, probe for the
 * oil-carrying row). The adapter owns what is SW-specific:
 *
 *   - The 90-day server cache in `qld_spec_cache` (migration
 *     20261113133000; request/response JSONB + created_at, keyed by
 *     normalized year|make|model|engine because Service Writer
 *     resolves specs by YMM, not by VIN). Successful resolutions
 *     are written under their CANONICAL key; the resolver reads
 *     them back through the cache port before spending probes.
 *   - The engine-hint assembly: the caller's stored/learned engine
 *     first, then an NHTSA VIN decode when the caller supplies a
 *     VIN and no engine — including when the VIN matched a
 *     workspace row (the Data Center used to skip the decode
 *     there, which is how engine-less 400s reached QLD).
 *
 * Contract:
 *   - Blanks only. This provider only ever answers values; every
 *     caller merges them under stronger sources (a shop's learned
 *     working spec, a human-entered value), so a QLD value can
 *     never overwrite what a human settled.
 *   - Engine-ambiguous means the choice is surfaced, never
 *     guessed: when no hint, decode, or hierarchy probe can settle
 *     the engine, the result is `engine_required` carrying QLD's
 *     own engine list — and no values.
 *   - Fail-open: missing key, QLD down, timeout, or a cache
 *     failure all degrade to `unavailable` (or a cache miss),
 *     which callers read as "spec not recorded" — the pre-QLD
 *     behavior, exactly.
 */
import type { OilSpecValues } from "@/lib/vehicle-spec-merge";
import { decodeVinWithNhtsa } from "@/server/hono/lib/vin-decode";
import { isQldConfigured, type QldClientDeps } from "./client";
import {
  displacementToken,
  resolveQldVehicle,
  type QldSpecCachePort,
} from "./resolver";

export interface QldSpecValues extends OilSpecValues {
  drainPlugTorqueFtLbs?: number;
}

export type QldSpecResult =
  | { status: "ok"; values: QldSpecValues }
  | { status: "engine_required"; engines: string[] }
  | { status: "unavailable" };

export interface QldLookupInput {
  year: number;
  make: string;
  model: string;
  engine?: string | null;
  /** When set and no engine is known, the decode supplies a hint. */
  vin?: string | null;
}

export interface QldProviderDeps extends QldClientDeps {
  /** Injectable clock for cache-TTL tests. */
  now?: () => Date;
  /**
   * Injectable VIN → engine-string decode (defaults to NHTSA
   * vPIC). Pass null to disable decoding entirely.
   */
  decodeEngineHint?: ((vin: string) => Promise<string | null>) | null;
}

const CACHE_TABLE = "qld_spec_cache";
const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function clean(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function finitePositive(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function normalized(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function qldCacheKey(input: QldLookupInput): string {
  return [
    String(input.year),
    normalized(input.make),
    normalized(input.model),
    normalized(input.engine ?? ""),
  ].join("|");
}

/**
 * Oil capacity in the house string format ("6.0 qt"). Quarts win;
 * a stated display string is next; liters are converted (a stated
 * value's unit conversion — the house rule allows exactly that).
 */
function capacityString(capacity: Record<string, unknown>): string | undefined {
  const quarts = finitePositive(capacity.quarts);
  if (quarts !== undefined) return `${quarts.toFixed(1)} qt`;
  const display = clean(capacity.display);
  if (display) return display;
  const liters = finitePositive(capacity.liters);
  if (liters !== undefined) return `${round1(liters * 1.05669).toFixed(1)} qt`;
  return undefined;
}

/**
 * The oil-filter part number in the house format. The learned-spec
 * record writes brand + number ("NAPA Gold 7055"), and NAPA Gold is
 * the first cross-reference QLD verifies, so it leads; WIX and STP
 * follow in QLD's own verification order.
 */
function oilFilterString(filters: Record<string, unknown>): string | undefined {
  const napaGold = clean(filters.napaGold);
  if (napaGold) return `NAPA Gold ${napaGold}`;
  const wix = clean(filters.wix);
  if (wix) return `WIX ${wix}`;
  const stp = clean(filters.stp);
  if (stp) return `STP ${stp}`;
  return undefined;
}

/**
 * Map a QLD service-spec body + filters body onto the spec shape the
 * house merges use. Written against the REAL response shapes captured
 * from the production API on 2026-11-13 (see __tests__/fixtures):
 * fields QLD states as null stay absent — a null is "not recorded",
 * never a value.
 */
export function mapQldSpecValues(
  serviceSpecBody: Record<string, unknown> | null,
  filtersBody: Record<string, unknown> | null,
): QldSpecValues {
  const values: QldSpecValues = {};
  const spec = record(serviceSpecBody?.spec);
  const vehicle = record(spec.vehicle);
  const engine = clean(vehicle.engine);
  if (engine) values.engine = engine;

  const oil = record(spec.oil);
  const viscosity = clean(oil.viscosity);
  if (viscosity) values.oilType = viscosity;
  const capacity = capacityString(record(oil.capacity));
  if (capacity) values.oilCapacity = capacity;
  const torque = record(oil.drainPlugTorque);
  const ftLbs = finitePositive(torque.ftLbs);
  if (ftLbs !== undefined) {
    values.drainPlugTorqueFtLbs = round1(ftLbs);
  } else {
    const nm = finitePositive(torque.nm);
    if (nm !== undefined) values.drainPlugTorqueFtLbs = round1(nm * 0.737562);
  }

  const filters = record(record(filtersBody?.spec).filters);
  const oilFilter = oilFilterString(filters);
  if (oilFilter) values.oilFilter = oilFilter;
  return values;
}

interface CachedPayload {
  values: QldSpecValues;
  serviceSpec: Record<string, unknown> | null;
  filters: Record<string, unknown> | null;
}

async function readCache(
  db: any,
  key: string,
  now: () => Date,
): Promise<CachedPayload | null> {
  try {
    const { data, error } = await db
      .from(CACHE_TABLE)
      .select("response,created_at")
      .eq("cache_key", key)
      .maybeSingle();
    if (error || !data) return null;
    const createdAt = new Date(String(data.created_at)).getTime();
    if (!Number.isFinite(createdAt) || now().getTime() - createdAt > CACHE_TTL_MS) {
      return null;
    }
    const response = record(data.response);
    const values = record(response.values);
    if (!Object.keys(values).length && !response.values) return null;
    return {
      values: values as QldSpecValues,
      serviceSpec: (response.serviceSpec as Record<string, unknown> | null) ?? null,
      filters: (response.filters as Record<string, unknown> | null) ?? null,
    };
  } catch {
    return null;
  }
}

async function writeCache(
  db: any,
  key: string,
  input: QldLookupInput,
  payload: CachedPayload,
): Promise<void> {
  try {
    await db.from(CACHE_TABLE).upsert(
      {
        cache_key: key,
        request: {
          year: input.year,
          make: input.make,
          model: input.model,
          engine: input.engine ?? null,
        },
        response: payload,
      },
      { onConflict: "cache_key" },
    );
  } catch {
    // A cache write failure never reaches the answer.
  }
}

/** Default VIN → engine hint: the free NHTSA vPIC decode. */
async function defaultDecodeEngineHint(
  vin: string,
  deps: QldProviderDeps,
): Promise<string | null> {
  const result = await decodeVinWithNhtsa(vin, deps.fetchImpl ?? fetch);
  return result.success ? result.vehicle.engine : null;
}

/**
 * Resolve one vehicle's spec values from QLD, cache-first. `db` is
 * the caller's Supabase client (the same handle the spec-resolution
 * paths already read through); every cache operation on it is
 * best-effort.
 */
export async function resolveQldSpec(
  db: any,
  input: QldLookupInput,
  deps: QldProviderDeps = {},
): Promise<QldSpecResult> {
  if (!isQldConfigured(deps)) return { status: "unavailable" };
  const year = Number(input.year);
  const make = clean(input.make);
  const model = clean(input.model);
  if (!Number.isFinite(year) || year <= 0 || !make || !model) {
    return { status: "unavailable" };
  }
  const now = deps.now ?? (() => new Date());
  const rawLookup: QldLookupInput = {
    year,
    make,
    model,
    engine: clean(input.engine) ?? null,
  };

  const cached = await readCache(db, qldCacheKey(rawLookup), now);
  if (cached) return { status: "ok", values: cached.values };

  // Engine hints, best first: the caller's stored/learned engine,
  // else a decode of the VIN. The decode runs whenever a VIN is
  // supplied and no engine is known — a workspace-row match no
  // longer stops the sourcing (that skip was one of the three
  // failure modes in the 2026-11-13 diagnosis).
  const hints: string[] = [];
  if (rawLookup.engine) hints.push(rawLookup.engine);
  const vin = clean(input.vin);
  if (!hints.length && vin && deps.decodeEngineHint !== null) {
    const decode =
      deps.decodeEngineHint ??
      ((value: string) => defaultDecodeEngineHint(value, deps));
    const decoded = await decode(vin).catch(() => null);
    if (clean(decoded)) hints.push(decoded as string);
  }

  // A repeat resolution with the same stored strings usually sits
  // in the cache under a hint-derived key (the canonical spelling
  // or its displacement token) — check those before any wire call.
  if (hints.length) {
    const guesses = new Set<string>();
    for (const hint of hints) {
      guesses.add(hint);
      const token = displacementToken(hint);
      if (token) guesses.add(token);
    }
    for (const guess of guesses) {
      const hit = await readCache(
        db,
        qldCacheKey({ ...rawLookup, engine: guess }),
        now,
      );
      if (hit) return { status: "ok", values: hit.values };
    }
  }

  const cachePort: QldSpecCachePort = {
    read: async (canonical) => {
      const hit = await readCache(db, qldCacheKey(canonical), now);
      if (!hit || !hit.serviceSpec) return null;
      return { serviceSpec: hit.serviceSpec, filters: hit.filters };
    },
  };

  const resolution = await resolveQldVehicle(
    { year, make, model, engineHints: hints },
    { ...deps, cachePort },
  );
  if (resolution.status === "engine_required") {
    return { status: "engine_required", engines: resolution.engines };
  }
  if (resolution.status !== "ok") return { status: "unavailable" };

  const values = mapQldSpecValues(resolution.serviceSpec, resolution.filters);
  if (!resolution.fromCache) {
    await writeCache(
      db,
      qldCacheKey(resolution.canonical),
      {
        year: resolution.canonical.year,
        make: resolution.canonical.make,
        model: resolution.canonical.model,
        engine: resolution.canonical.engine || null,
      },
      {
        values,
        serviceSpec: resolution.serviceSpec,
        filters: resolution.filters,
      },
    );
  }
  return { status: "ok", values };
}

/**
 * Compose the catalog tier from the legacy table resolution and the
 * QLD resolution: QLD wins every field it answers (it is the source);
 * the table fills only the fields QLD left blank. Both sit under the
 * learned tier in the merge, so nothing here can overwrite a value a
 * human settled.
 */
export function combineCatalogValues(
  tableCatalog: OilSpecValues,
  qld: QldSpecValues | null,
): OilSpecValues {
  if (!qld) return tableCatalog;
  const combined: OilSpecValues = { ...tableCatalog };
  for (const field of ["engine", "oilType", "oilCapacity", "oilFilter"] as const) {
    const value = clean(qld[field]);
    if (value) combined[field] = value;
  }
  return combined;
}

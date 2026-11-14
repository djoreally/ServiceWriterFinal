/**
 * Spec backfill — fill the learned tier's blanks from the catalog.
 *
 * Ty's directive (2026-11-13, from his phone): jobs whose vehicles
 * carry a resolvable identity but blank specs must not sit at "Not
 * recorded" now that the QLD connection is live — "you do need to
 * backfill the specs if we have the connection once we get the
 * connection wired up." His screenshot was a 2024 Chevrolet Suburban
 * job with NO VIN recorded: every read path keyed on the VIN starved,
 * even though year/make/model alone resolve through the resolver.
 *
 * What this routine does, per vehicle, across every workspace (or
 * one, when scoped):
 *
 *   1. AUDIT: count the vehicle — identity resolvable (year/make/
 *      model, completed blanks-only from the VIN decode when a VIN
 *      exists) and the learned working spec (`vehicle_service_specs`)
 *      missing or blank in any of engine / oil_type / oil_capacity /
 *      oil_filter. Fully populated learned rows are counted
 *      `already_present` and never touched.
 *   2. ENGINE SETTLEMENT — a backfill WRITES persistent values, so
 *      the engine must be settled by evidence, never probed into a
 *      guess. Priority: the stored (learned) engine → the BOOKING
 *      SNAPSHOT's engine (what was actually booked is the record) →
 *      the VIN decode → QLD's own hierarchy (a lone engine for the
 *      YMM settles it; a hint that singles out one hierarchy engine
 *      settles it). Several candidate engines with no settling
 *      evidence answer `ambiguous_engine` and the vehicle is left
 *      exactly as it was — the same honesty the read paths surface
 *      as engine_required.
 *   3. FILL: resolve through `resolveQldSpec` with the settled
 *      engine and write BLANKS ONLY into the learned tier. A
 *      learned/human value always wins; a non-blank field is never
 *      overwritten. Provenance rides in the row's metadata:
 *      `spec_backfill: { source: "qld_catalog_backfill", at,
 *      engine_source }`, and rows the backfill creates carry
 *      `source: "qld_catalog_backfill"` (existing rows keep their
 *      own source label).
 *
 * Idempotent by construction: a second run finds no blanks on the
 * rows the first filled, counts them `already_present`, and writes
 * nothing. Counts only in the report — no vehicle, customer, or VIN
 * data is ever logged.
 *
 * The runnable form is scripts/backfill-vehicle-specs.ts
 * (`npm run specs:backfill`), mirroring the carfax:feed convention:
 * core logic here, a thin tsx CLI with the service-role client.
 */
import { fetchQldJson, type QldClientDeps } from "./client";
import {
  displacementToken,
  looseNorm,
  matchQldCandidate,
  stripTruckSuffix,
} from "./resolver";
import { resolveQldSpec, type QldSpecResult } from "./spec-provider";
import {
  fillVehicleIdentityBlanks,
  type VehicleIdentity,
} from "@/server/hono/lib/data-center";
import {
  decodeVinWithNhtsa,
  type DecodedVehicle,
} from "@/server/hono/lib/vin-decode";

export const BACKFILL_SOURCE = "qld_catalog_backfill";

export type BackfillOutcome =
  | "filled"
  | "already_present"
  | "ambiguous_engine"
  | "unresolvable"
  | "error";

export interface BackfillReport {
  scanned: number;
  filled: number;
  alreadyPresent: number;
  ambiguousEngine: number;
  unresolvable: number;
  errors: number;
  /** Vehicles whose identity was resolvable AND whose learned spec had a blank — the audit numerator. */
  withBlanks: number;
  dryRun: boolean;
}

export interface BackfillDeps extends QldClientDeps {
  /** Defaults to resolveQldSpec. Injectable for tests. */
  resolveSpec?: (
    db: any,
    input: { year: number; make: string; model: string; engine?: string | null; vin?: string | null },
    deps?: QldClientDeps,
  ) => Promise<QldSpecResult>;
  /** Defaults to the NHTSA decode. Injectable for tests; null disables. */
  decodeVin?: ((vin: string) => Promise<DecodedVehicle | null>) | null;
  /**
   * QLD's canonical engine list for a YMM (0-credit hierarchy).
   * Defaults to the live hierarchy walk; injectable for tests.
   * Null = the hierarchy could not be read.
   */
  fetchEngines?: (input: { year: number; make: string; model: string }) => Promise<string[] | null>;
  now?: () => Date;
  pageSize?: number;
  dryRun?: boolean;
  workspaceId?: string | null;
  /** Hard cap on vehicles scanned (runner safety valve). */
  limit?: number | null;
  log?: (line: string) => void;
}

interface VehicleRow {
  id: string;
  workspace_id: string;
  vin: unknown;
  year: unknown;
  make: unknown;
  model: unknown;
}

interface LearnedRow {
  engine: unknown;
  oil_type: unknown;
  oil_capacity: unknown;
  oil_filter: unknown;
  source: unknown;
  metadata: unknown;
}

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function yearNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeVin(value: unknown): string | null {
  const vin = typeof value === "string" ? value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
  return vin || null;
}

// ---------------------------------------------------------------------------
// Engine settlement
// ---------------------------------------------------------------------------

export type EngineHintSource = "stored" | "snapshot" | "decode";

export interface EngineHint {
  source: EngineHintSource;
  value: string;
}

/**
 * Settle the engine from evidence, or answer null (ambiguous).
 * `engines` is QLD's canonical list for the YMM (null when the
 * hierarchy could not be read). A hint settles when it names one
 * engine exactly, when it IS the plain displacement token of one
 * engine (QLD's oil rows hang on the plain token — the resolver's
 * own rule), or when its displacement token singles out exactly
 * one engine. A lone hierarchy engine settles on its own.
 */
export function settleEngine(
  engines: string[] | null,
  hints: EngineHint[],
): { engine: string; source: EngineHintSource | "hierarchy" } | null {
  for (const hint of hints) {
    if (!engines || !engines.length) {
      // No hierarchy to contradict it: a sourced hint (a stored
      // value, the booked snapshot, a VIN decode) is evidence,
      // not a guess — resolve with it directly.
      return { engine: hint.value, source: hint.source };
    }
    const exact = engines.find((engine) => looseNorm(engine) === looseNorm(hint.value));
    if (exact) return { engine: exact, source: hint.source };
    const token = displacementToken(hint.value);
    if (token) {
      const plain = engines.find((engine) => engine.trim() === token);
      if (plain) return { engine: plain, source: hint.source };
      const sharing = engines.filter((engine) => displacementToken(engine) === token);
      if (sharing.length === 1) return { engine: sharing[0], source: hint.source };
    }
  }
  if (engines && engines.length === 1) {
    return { engine: engines[0], source: "hierarchy" };
  }
  return null;
}

// ---------------------------------------------------------------------------
// QLD hierarchy (default fetchEngines)
// ---------------------------------------------------------------------------

function stringList(body: Record<string, unknown>, key: string): string[] {
  const raw = body[key] ?? record(body.spec)[key];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => clean(entry) ?? clean(record(entry).engine) ?? clean(record(entry).name))
    .filter((entry): entry is string => Boolean(entry));
}

async function hierarchyList(
  path: string,
  key: string,
  deps: QldClientDeps,
): Promise<string[] | null> {
  const result = await fetchQldJson(path, deps);
  if (!result || result.status < 200 || result.status >= 300) return null;
  return stringList(result.body, key);
}

/** Canonicalize make/model against QLD's hierarchy, then read its engine list. */
export async function fetchQldEngines(
  input: { year: number; make: string; model: string },
  deps: QldClientDeps = {},
): Promise<string[] | null> {
  const makes = await hierarchyList(
    `/api/v1/developer/makes?${new URLSearchParams({ year: String(input.year) }).toString()}`,
    "makes",
    deps,
  );
  let make = input.make;
  if (makes) make = matchQldCandidate(input.make, makes) ?? stripTruckSuffix(input.make);
  const models =
    (await hierarchyList(
      `/api/v1/developer/models?${new URLSearchParams({ year: String(input.year), make }).toString()}`,
      "models",
      deps,
    )) ??
    (make !== input.make
      ? await hierarchyList(
          `/api/v1/developer/models?${new URLSearchParams({ year: String(input.year), make: input.make }).toString()}`,
          "models",
          deps,
        )
      : null);
  let model = input.model;
  if (models) model = matchQldCandidate(input.model, models) ?? input.model;
  return hierarchyList(
    `/api/v1/developer/engines?${new URLSearchParams({ year: String(input.year), make, model }).toString()}`,
    "engines",
    deps,
  );
}

// ---------------------------------------------------------------------------
// Booking snapshot engine (appointments.metadata.booking_configuration)
// ---------------------------------------------------------------------------

/**
 * The engine the BOOKING SNAPSHOT recorded for this vehicle, from
 * the vehicle's most recent appointments. The snapshot is what was
 * actually booked — as an engine source it outranks a decode and
 * any probing. Matches the snapshot entry by clientVehicleId, then
 * VIN, then a unique year/make/model.
 */
export async function snapshotEngineForVehicle(
  db: any,
  workspaceId: string,
  vehicle: VehicleRow,
): Promise<string | null> {
  try {
    const { data, error } = await db
      .from("appointments")
      .select("metadata,created_at")
      .eq("workspace_id", workspaceId)
      .eq("vehicle_id", vehicle.id)
      .order("created_at", { ascending: false })
      .limit(10);
    if (error || !Array.isArray(data)) return null;
    const vin = normalizeVin(vehicle.vin);
    const year = yearNumber(vehicle.year);
    const make = clean(vehicle.make)?.toLowerCase() ?? null;
    const model = clean(vehicle.model)?.toLowerCase() ?? null;
    for (const row of data as Array<Record<string, unknown>>) {
      const configuration = record(record(row.metadata).booking_configuration);
      const entries = Array.isArray(configuration.vehicles)
        ? (configuration.vehicles as Array<Record<string, unknown>>)
        : [];
      const matches = entries.filter((entry) => {
        if (clean(entry.clientVehicleId) === vehicle.id) return true;
        const entryVehicle = record(entry.vehicle);
        if (vin && normalizeVin(entryVehicle.vin) === vin) return true;
        return Boolean(
          year &&
            make &&
            model &&
            yearNumber(entryVehicle.year) === year &&
            clean(entryVehicle.make)?.toLowerCase() === make &&
            clean(entryVehicle.model)?.toLowerCase() === model,
        );
      });
      const candidates = matches.length === 1 ? matches : entries.length === 1 ? entries : [];
      for (const entry of candidates) {
        const engine = clean(record(entry.oil).engine);
        if (engine) return engine;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The walk
// ---------------------------------------------------------------------------

const SPEC_FIELDS = ["engine", "oil_type", "oil_capacity", "oil_filter"] as const;

async function backfillVehicle(
  db: any,
  vehicle: VehicleRow,
  deps: Required<Pick<BackfillDeps, "resolveSpec" | "fetchEngines" | "now">> &
    BackfillDeps,
): Promise<BackfillOutcome> {
  const workspaceId = vehicle.workspace_id;

  const { data: learnedData } = await db
    .from("vehicle_service_specs")
    .select("engine,oil_type,oil_capacity,oil_filter,source,metadata")
    .eq("workspace_id", workspaceId)
    .eq("vehicle_id", vehicle.id)
    .maybeSingle();
  const learned = (learnedData ?? null) as LearnedRow | null;
  const current: Record<(typeof SPEC_FIELDS)[number], string | null> = {
    engine: clean(learned?.engine),
    oil_type: clean(learned?.oil_type),
    oil_capacity: clean(learned?.oil_capacity),
    oil_filter: clean(learned?.oil_filter),
  };
  const blanks = SPEC_FIELDS.filter((field) => current[field] === null);
  if (!blanks.length) return "already_present";

  // Identity: stored first; the VIN decode completes blanks only.
  // The decode is lazy — it runs when the identity is incomplete
  // or when no stored/snapshot engine exists to settle from.
  const vin = normalizeVin(vehicle.vin);
  let decoded: DecodedVehicle | null = null;
  let decodeTried = false;
  const decodeOnce = async (): Promise<DecodedVehicle | null> => {
    if (decodeTried) return decoded;
    decodeTried = true;
    if (vin && deps.decodeVin !== null) {
      const decode = deps.decodeVin ?? defaultDecodeVin;
      decoded = await decode(vin).catch(() => null);
    }
    return decoded;
  };
  let identity: VehicleIdentity = {
    vin,
    year: yearNumber(vehicle.year),
    make: clean(vehicle.make),
    model: clean(vehicle.model),
    engine: null,
  };
  if (!(identity.year && identity.make && identity.model)) {
    const result = await decodeOnce();
    if (result) identity = fillVehicleIdentityBlanks(identity, result);
  }
  if (!identity.year || !identity.make || !identity.model) return "unresolvable";

  // Engine evidence, in the doctrine's priority order.
  const hints: EngineHint[] = [];
  if (current.engine) hints.push({ source: "stored", value: current.engine });
  const snapshotEngine = await snapshotEngineForVehicle(db, workspaceId, vehicle);
  if (snapshotEngine) hints.push({ source: "snapshot", value: snapshotEngine });
  if (!hints.length) await decodeOnce();
  if (decoded?.engine) hints.push({ source: "decode", value: decoded.engine });

  const engines = await deps
    .fetchEngines({ year: identity.year, make: identity.make, model: identity.model })
    .catch(() => null);
  const settled = settleEngine(engines, hints);
  if (!settled) return engines && engines.length > 1 ? "ambiguous_engine" : "unresolvable";

  const resolved = await deps.resolveSpec(
    db,
    {
      year: identity.year,
      make: identity.make,
      model: identity.model,
      engine: settled.engine,
      vin,
    },
    deps,
  );
  if (resolved.status === "engine_required") return "ambiguous_engine";
  if (resolved.status !== "ok") return "unresolvable";

  const values = resolved.values;
  const incoming: Record<(typeof SPEC_FIELDS)[number], string | null> = {
    engine: clean(values.engine) ?? settled.engine,
    oil_type: clean(values.oilType),
    oil_capacity: clean(values.oilCapacity),
    oil_filter: clean(values.oilFilter),
  };
  const patch: Partial<Record<(typeof SPEC_FIELDS)[number], string>> = {};
  for (const field of blanks) {
    const value = incoming[field];
    if (value) patch[field] = value;
  }
  const metadata = { ...record(learned?.metadata) };
  if (
    values.drainPlugTorqueFtLbs !== undefined &&
    typeof metadata.drain_plug_torque_ft_lbs !== "number"
  ) {
    metadata.drain_plug_torque_ft_lbs = values.drainPlugTorqueFtLbs;
  }
  const fillsSomething =
    Object.keys(patch).length > 0 ||
    metadata.drain_plug_torque_ft_lbs !== record(learned?.metadata).drain_plug_torque_ft_lbs;
  if (!fillsSomething) return "already_present";

  if (!deps.dryRun) {
    metadata.spec_backfill = {
      source: BACKFILL_SOURCE,
      at: deps.now().toISOString(),
      engine_source: settled.source,
    };
    const { error } = await db.from("vehicle_service_specs").upsert(
      {
        workspace_id: workspaceId,
        vehicle_id: vehicle.id,
        engine: patch.engine ?? current.engine,
        oil_type: patch.oil_type ?? current.oil_type,
        oil_capacity: patch.oil_capacity ?? current.oil_capacity,
        oil_filter: patch.oil_filter ?? current.oil_filter,
        source: clean(learned?.source) ?? BACKFILL_SOURCE,
        metadata,
        updated_at: deps.now().toISOString(),
      },
      { onConflict: "workspace_id,vehicle_id" },
    );
    if (error) throw error;
  }
  return "filled";
}

async function defaultDecodeVin(vin: string): Promise<DecodedVehicle | null> {
  const result = await decodeVinWithNhtsa(vin);
  return result.success ? result.vehicle : null;
}

/**
 * Walk every vehicle (or one workspace's) and backfill the learned
 * tier's blanks. Counts only — the report is the audit.
 */
export async function runSpecBackfill(
  db: any,
  deps: BackfillDeps = {},
): Promise<BackfillReport> {
  const pageSize = Math.max(1, deps.pageSize ?? 200);
  const resolvedDeps = {
    ...deps,
    resolveSpec: deps.resolveSpec ?? resolveQldSpec,
    fetchEngines:
      deps.fetchEngines ??
      ((input: { year: number; make: string; model: string }) =>
        fetchQldEngines(input, deps)),
    now: deps.now ?? (() => new Date()),
  };
  const report: BackfillReport = {
    scanned: 0,
    filled: 0,
    alreadyPresent: 0,
    ambiguousEngine: 0,
    unresolvable: 0,
    errors: 0,
    withBlanks: 0,
    dryRun: Boolean(deps.dryRun),
  };
  const limit = deps.limit ?? Number.POSITIVE_INFINITY;

  let offset = 0;
  for (;;) {
    let query = db
      .from("vehicles")
      .select("id,workspace_id,vin,year,make,model")
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (deps.workspaceId) query = query.eq("workspace_id", deps.workspaceId);
    const { data, error } = await query;
    if (error) throw error;
    const rows = (Array.isArray(data) ? data : []) as VehicleRow[];
    if (!rows.length) break;
    for (const vehicle of rows) {
      if (report.scanned >= limit) break;
      report.scanned += 1;
      try {
        const outcome = await backfillVehicle(db, vehicle, resolvedDeps);
        if (outcome !== "already_present") report.withBlanks += 1;
        if (outcome === "filled") report.filled += 1;
        else if (outcome === "already_present") report.alreadyPresent += 1;
        else if (outcome === "ambiguous_engine") report.ambiguousEngine += 1;
        else if (outcome === "unresolvable") report.unresolvable += 1;
        else report.errors += 1;
      } catch {
        report.errors += 1;
      }
    }
    if (rows.length < pageSize || report.scanned >= limit) break;
    offset += pageSize;
  }
  deps.log?.(
    JSON.stringify({
      event: "spec_backfill_complete",
      scanned: report.scanned,
      with_blanks: report.withBlanks,
      filled: report.filled,
      already_present: report.alreadyPresent,
      ambiguous_engine: report.ambiguousEngine,
      unresolvable: report.unresolvable,
      errors: report.errors,
      dry_run: report.dryRun,
    }),
  );
  return report;
}

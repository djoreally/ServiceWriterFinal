/**
 * B4 — the per-vehicle spec merge (truth rows T-2 / T-3 / T-18).
 *
 * The booking-configuration response is a server-side merge of three
 * sources, strongest first:
 *
 *   1. learned  — `vehicle_service_specs`: what this shop has settled for
 *      THIS vehicle (the working spec, T-3). At-job actuals live here.
 *   2. catalog  — `vehicle_specifications`: the reference spec for the
 *      vehicle's year/make/model (engine-disambiguated, consensus-checked
 *      — see resolveCatalogOilValues). The seed when the shop has not
 *      settled a value yet.
 *   3. snapshot — the immutable `appointments.metadata` booking
 *      configuration. Provenance only: it surfaces when neither the
 *      learned record nor the catalog can speak for a field, and it is
 *      never rewritten.
 *
 * Every merged field carries its source, and each vehicle carries one
 * `specStatus` for the oil group (oilType / oilCapacity / oilFilter),
 * so no client ever has to invent a placeholder label again:
 *
 *   - "verified"           — every core field is present and learned.
 *   - "from_catalog"       — every core field is present, none rests on
 *                            the snapshot, at least one came from the
 *                            catalog (present, but not yet shop-settled).
 *   - "needs_verification" — a core field is missing entirely, or rests
 *                            only on the booking-time snapshot claim.
 *
 * This module is pure: the database reads live in
 * `@/server/appointments/spec-resolution`.
 */

export type SpecSource = "learned" | "catalog" | "snapshot";

export type VehicleSpecStatus =
  | "verified"
  | "from_catalog"
  | "needs_verification";

export interface OilSpecValues {
  engine?: string;
  oilType?: string;
  oilCapacity?: string;
  oilFilter?: string;
}

export type OilSpecSources = Partial<
  Record<"engine" | "oilType" | "oilCapacity" | "oilFilter", SpecSource>
>;

export interface MergedOilSpec {
  oil?: OilSpecValues & { capacitySource?: "db" | "ai" | "manual" };
  specStatus: VehicleSpecStatus;
  specSources: OilSpecSources;
}

/** The fields a tech pours by — the oil group the spec block renders. */
const CORE_FIELDS = ["oilType", "oilCapacity", "oilFilter"] as const;

function clean(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * The oil group's status from the merged fields + their sources.
 * The status is the weakest link among the core fields: a group is only
 * as trustworthy as the least-settled value in it.
 */
export function computeSpecStatus(
  oil: OilSpecValues | undefined,
  sources: OilSpecSources,
): VehicleSpecStatus {
  if (!oil) return "needs_verification";
  let sawCatalog = false;
  for (const field of CORE_FIELDS) {
    if (!clean(oil[field])) return "needs_verification";
    const source = sources[field];
    if (source === "snapshot" || !source) return "needs_verification";
    if (source === "catalog") sawCatalog = true;
  }
  return sawCatalog ? "from_catalog" : "verified";
}

/**
 * Merge one vehicle's oil spec across the three sources, per field:
 * learned wins, then catalog, then the snapshot (provenance). Returns
 * the merged oil block (undefined when no source has any value), the
 * per-field sources, and the group's specStatus.
 */
export function mergeOilSpec(input: {
  learned?: OilSpecValues | null;
  catalog?: OilSpecValues | null;
  snapshot?: (OilSpecValues & { capacitySource?: "db" | "ai" | "manual" }) | null;
}): MergedOilSpec {
  const values: OilSpecValues = {};
  const sources: OilSpecSources = {};
  const tiers: Array<{ name: SpecSource; values?: OilSpecValues | null }> = [
    { name: "learned", values: input.learned },
    { name: "catalog", values: input.catalog },
    { name: "snapshot", values: input.snapshot },
  ];
  for (const field of ["engine", "oilType", "oilCapacity", "oilFilter"] as const) {
    for (const tier of tiers) {
      const value = clean(tier.values?.[field]);
      if (value) {
        values[field] = value;
        sources[field] = tier.name;
        break;
      }
    }
  }
  const hasAny = ["engine", "oilType", "oilCapacity", "oilFilter"].some(
    (field) => values[field as keyof OilSpecValues],
  );
  if (!hasAny) {
    return { specStatus: "needs_verification", specSources: {} };
  }
  // capacitySource is the legacy provenance hint the snapshot format
  // carries; keep it truthful for the tier the capacity came from
  // (learned values are shop-entered → "manual", catalog → "db", the
  // snapshot keeps whatever it recorded).
  let capacitySource: "db" | "ai" | "manual" | undefined;
  if (values.oilCapacity) {
    if (sources.oilCapacity === "learned") capacitySource = "manual";
    else if (sources.oilCapacity === "catalog") capacitySource = "db";
    else capacitySource = input.snapshot?.capacitySource;
  }
  return {
    oil: { ...values, ...(capacitySource ? { capacitySource } : {}) },
    specStatus: computeSpecStatus(values, sources),
    specSources: sources,
  };
}

function normalized(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Displacement token ("2.0" from "2.0L Turbo" / "2.0 L") for engine matching. */
function displacementOf(engine: unknown): string | null {
  const match = String(engine ?? "").match(/(\d+\.\d+)\s*(?:l\b|liter)/i);
  return match ? match[1] : null;
}

function engineMatches(candidate: unknown, hint: string): boolean {
  const a = normalized(candidate);
  const b = normalized(hint);
  if (!a) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const da = displacementOf(candidate);
  const db = displacementOf(hint);
  return Boolean(da && db && da === db);
}

export interface CatalogSpecCandidate extends OilSpecValues {
  engine?: string;
}

/**
 * Resolve catalog oil values for one vehicle from every catalog row
 * matching its year/make/model. Never invents: a field is filled only
 * when the candidate pool agrees on exactly one value for it.
 *
 * Pool selection: when an engine hint exists (learned or snapshot) and
 * at least one row matches it, the pool narrows to the matching rows;
 * otherwise the whole YMM pool stands. Per field, distinct non-empty
 * values across the pool must number exactly one.
 */
export function resolveCatalogOilValues(
  candidates: CatalogSpecCandidate[],
  engineHint?: string | null,
): OilSpecValues {
  if (!candidates.length) return {};
  let pool = candidates;
  const hint = clean(engineHint);
  if (hint) {
    const narrowed = candidates.filter((row) => engineMatches(row.engine, hint));
    if (narrowed.length) pool = narrowed;
  }
  const resolved: OilSpecValues = {};
  for (const field of ["engine", "oilType", "oilCapacity", "oilFilter"] as const) {
    const distinct = new Map<string, string>();
    for (const row of pool) {
      const value = clean(row[field]);
      if (value) distinct.set(normalized(value), value);
    }
    if (distinct.size === 1) {
      resolved[field] = [...distinct.values()][0];
    }
  }
  return resolved;
}

/**
 * Ordered union of id lists: first-seen order wins, duplicates and
 * blanks dropped. Used to compose a job's vehicle membership from its
 * several partial sources (snapshot, item pins, invoice pins, FK).
 */
export function orderedUnion(
  ...lists: Array<Array<string | null | undefined>>
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const id of list) {
      if (typeof id === "string" && id.trim() && !seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  }
  return out;
}

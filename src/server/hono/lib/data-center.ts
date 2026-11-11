/**
 * Tech-app Data Center assembly (2026-11-11).
 *
 * Pure pieces of GET /v1/tech-app/data-center/vehicle: capacity
 * parsing, catalog/workspace spec mapping, spec merging, and the
 * appliesTo derivation from the workspace's own service catalog.
 * The rule over all of it (owner's contract): never invent a spec —
 * a field is the value a source stated (a unit conversion of a
 * stated value included), or null.
 */

export interface DataCenterSpecs {
  oilType: string | null;
  oilCapacityQuarts: number | null;
  oilFilter: string | null;
  drainPlugTorqueFtLbs: number | null;
  tireSize: string | null;
  tirePressurePsi: number | null;
  coolantType: string | null;
  batteryGroup: string | null;
}

export const EMPTY_SPECS: DataCenterSpecs = {
  oilType: null,
  oilCapacityQuarts: null,
  oilFilter: null,
  drainPlugTorqueFtLbs: null,
  tireSize: null,
  tirePressurePsi: null,
  coolantType: null,
  batteryGroup: null,
};

export function hasAnySpec(specs: DataCenterSpecs): boolean {
  return Object.values(specs).some((value) => value !== null);
}

/** Fill the null fields of `base` from `fill`; base always wins. */
export function mergeSpecs(base: DataCenterSpecs, fill: DataCenterSpecs): DataCenterSpecs {
  const out = { ...base };
  (Object.keys(out) as (keyof DataCenterSpecs)[]).forEach((key) => {
    if (out[key] === null && fill[key] !== null) {
      (out as Record<string, unknown>)[key] = fill[key];
    }
  });
  return out;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Parse a stated oil capacity ("6.5 liters with filter", "8.0 qt",
 * "5.3 quarts") into quarts. A bare number with no unit is NOT
 * guessed — it stays null.
 */
export function parseCapacityQuarts(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /([0-9]+(?:\.[0-9]+)?)/.exec(value);
  if (!match) return null;
  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (/lit(er|re)/i.test(value)) return round1(amount * 1.05669);
  if (/quart|\bqt\b/i.test(value)) return round1(amount);
  return null;
}

export interface CatalogSpecRow {
  engine: string | null;
  oil_type: string | null;
  oil_capacity: string | null;
  oil_filter: string | null;
}

/**
 * Pick the one catalog row a specs answer may come from. One variant
 * needs no match; several variants need the vehicle's engine to
 * single one out (displacement token, e.g. "3.0" inside "Turbo 3.0"),
 * otherwise the honest answer is no row.
 */
export function pickCatalogRow<T extends CatalogSpecRow>(rows: T[], engine: string | null): T | null {
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0];
  if (!engine) return null;
  const displacement = /([0-9]+(?:\.[0-9]+)?)\s*L/i.exec(engine);
  if (!displacement) return null;
  const token = displacement[1];
  const matches = rows.filter((row) => (row.engine ?? "").includes(token));
  return matches.length === 1 ? matches[0] : null;
}

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function specsFromCatalogRow(row: CatalogSpecRow): DataCenterSpecs {
  return {
    ...EMPTY_SPECS,
    oilType: cleanString(row.oil_type),
    oilCapacityQuarts: parseCapacityQuarts(row.oil_capacity),
    oilFilter: cleanString(row.oil_filter),
  };
}

export interface WorkspaceSpecRow {
  oil_type?: unknown;
  oil_capacity?: unknown;
  oil_filter?: unknown;
  metadata?: unknown;
}

/** vehicle_service_specs row -> specs; extra facts ride in metadata. */
export function specsFromWorkspaceRow(row: WorkspaceSpecRow): DataCenterSpecs {
  const metadata =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  const torque = metadata.drain_plug_torque_ft_lbs;
  return {
    ...EMPTY_SPECS,
    oilType: cleanString(row.oil_type),
    oilCapacityQuarts: parseCapacityQuarts(
      typeof row.oil_capacity === "string" ? row.oil_capacity : null,
    ),
    oilFilter: cleanString(row.oil_filter),
    drainPlugTorqueFtLbs:
      typeof torque === "number" && Number.isFinite(torque) && torque > 0 ? torque : null,
    coolantType: cleanString(metadata.coolant_type),
    batteryGroup: cleanString(metadata.battery_group),
  };
}

const SERVICE_KEYWORDS: [string, RegExp][] = [
  ["oil", /oil|lube/i],
  ["tires", /tire|tyre|rotation/i],
  ["brakes", /brake/i],
  ["wash", /wash|detail/i],
  ["battery", /battery/i],
  ["filters", /filter/i],
  ["inspection", /inspect/i],
];

/**
 * The platform is customized per industry: a workspace's Data Center
 * follows the services that workspace actually sells. appliesTo is
 * derived from its active service_catalog rows (names + categories),
 * in a stable order, so the app can hide what does not apply.
 */
export function appliesToFromCatalog(
  rows: { name?: unknown; category?: unknown }[],
): string[] {
  const found = new Set<string>();
  for (const row of rows) {
    const text = `${typeof row.category === "string" ? row.category : ""} ${typeof row.name === "string" ? row.name : ""}`;
    for (const [token, pattern] of SERVICE_KEYWORDS) {
      if (pattern.test(text)) found.add(token);
    }
  }
  return SERVICE_KEYWORDS.map(([token]) => token).filter((token) => found.has(token));
}

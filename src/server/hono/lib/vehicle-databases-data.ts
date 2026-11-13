/**
 * Vehicle Databases data APIs (Data Center depth, 2026-11-11).
 *
 * Three VIN-keyed reads behind VEHICLE_DATABASES_API_KEY, used by
 * the tech-app Data Center only for fields the in-house sources
 * (workspace specs, the vehicle_specifications table, the bundled
 * catalog, Wheel-Size) could not fill — the calls spend account
 * credits, so they are the last resort, never the first look.
 *
 *   GET /oil-lookup/{vin}              oil spec/capacity/filter, tires
 *   GET /fluid-specs/{vin}             coolant + the other fluids
 *   GET /vehicle-maintenance/v4/{vin}  factory maintenance schedule
 *
 * The maintenance response shape is documented exactly
 * ({ status, data: { maintenance: [{ mileage: { miles, km },
 * service_items: [...] }] } }). The oil/fluids bodies are documented
 * thinly, so those mappers read tolerantly (flattened, key-matched)
 * and the house rule still governs: a value is what a source stated
 * or null — a bare capacity number with no unit is never guessed.
 * Every call fails soft: an error, a 402/429, or an unreadable body
 * answers success:false and the Data Center carries on without it.
 */

import {
  EMPTY_SPECS,
  parseCapacityQuarts,
  type DataCenterSpecs,
} from "./data-center";

export interface MaintenanceInterval {
  miles: number;
  km: number | null;
  items: string[];
}

export type VehicleDataResult<T> =
  | { success: true; value: T }
  | { success: false; error: string };

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** Flatten nested objects into "path.key" -> scalar entries (depth-capped). */
function flatten(
  value: unknown,
  prefix: string,
  depth: number,
  out: Map<string, unknown>,
): void {
  if (depth > 3 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => flatten(entry, `${prefix}[${index}]`, depth + 1, out));
    return;
  }
  const record = asRecord(value);
  if (record) {
    for (const [key, entry] of Object.entries(record)) {
      flatten(entry, prefix ? `${prefix}.${key}` : key, depth + 1, out);
    }
    return;
  }
  if (prefix) out.set(prefix.toLowerCase(), value);
}

function flatMapOf(payload: unknown): Map<string, unknown> {
  const root = asRecord(payload);
  const start = root ? (asRecord(root.data) ?? root) : null;
  const out = new Map<string, unknown>();
  if (start) flatten(start, "", 0, out);
  return out;
}

function firstString(
  flat: Map<string, unknown>,
  predicate: (key: string) => boolean,
): string | null {
  for (const [key, value] of flat) {
    if (!predicate(key)) continue;
    const text = cleanString(value);
    if (text) return text;
  }
  return null;
}

/**
 * Engine Oil Lookup body -> specs. Key-matched over the flattened
 * body; capacity goes through the shared unit parser, so a value
 * only lands when it states its unit.
 */
export function mapOilLookupResponse(payload: unknown): DataCenterSpecs {
  const flat = flatMapOf(payload);
  const specs: DataCenterSpecs = { ...EMPTY_SPECS };

  const capacityText = firstString(
    flat,
    (key) => /oil/.test(key) && /capacit|volume|qty|amount/.test(key),
  );
  specs.oilCapacityQuarts = parseCapacityQuarts(capacityText);

  // Prefer an oil-type value that actually states a viscosity grade.
  let oilType = firstString(
    flat,
    (key) =>
      /oil/.test(key) &&
      /type|viscosit|grade|weight|spec|recommend/.test(key) &&
      typeof flat.get(key) === "string" &&
      /\d+\s?[Ww]\s?-\s?\d+/.test(String(flat.get(key))),
  );
  if (!oilType) {
    oilType = firstString(
      flat,
      (key) => /oil/.test(key) && /type|viscosit|grade|weight|spec|recommend/.test(key),
    );
  }
  specs.oilType = oilType;

  const filter = firstString(flat, (key) => /filter/.test(key));
  specs.oilFilter = filter && filter.length <= 40 ? filter : null;

  for (const value of flat.values()) {
    const text = cleanString(value);
    if (!text) continue;
    const tire = /\d{3}\/\d{2}\s?R\s?\d{2}(?:\.\d)?/.exec(text);
    if (tire) {
      specs.tireSize = tire[0].replace(/\s+/g, "");
      break;
    }
  }

  return specs;
}

/** Fluids & Capacities body -> specs (the Data Center carries coolant). */
export function mapFluidSpecsResponse(payload: unknown): DataCenterSpecs {
  const flat = flatMapOf(payload);
  const specs: DataCenterSpecs = { ...EMPTY_SPECS };
  specs.coolantType =
    firstString(
      flat,
      (key) => /coolant|antifreeze/.test(key) && /type|spec|name|fluid/.test(key),
    ) ?? firstString(flat, (key) => /coolant|antifreeze/.test(key));
  return specs;
}

/**
 * Vehicle Maintenance v4 body -> the factory schedule, ascending by
 * mileage. Intervals with no mileage or no service items are
 * dropped; a body with no usable interval answers null.
 */
export function mapMaintenanceResponse(payload: unknown): MaintenanceInterval[] | null {
  const root = asRecord(payload);
  const data = root ? asRecord(root.data) : null;
  const list = data && Array.isArray(data.maintenance) ? data.maintenance : null;
  if (!list) return null;

  const intervals: MaintenanceInterval[] = [];
  for (const entry of list) {
    const record = asRecord(entry);
    if (!record) continue;
    const mileage = asRecord(record.mileage);
    const milesRaw = mileage ? mileage.miles : undefined;
    const miles = typeof milesRaw === "number" ? milesRaw : Number(milesRaw);
    if (!Number.isFinite(miles) || miles <= 0) continue;
    const kmRaw = mileage ? mileage.km : undefined;
    const km = typeof kmRaw === "number" ? kmRaw : Number(kmRaw);
    const rawItems = Array.isArray(record.service_items) ? record.service_items : [];
    const items = rawItems
      .map((item) => cleanString(item))
      .filter((item): item is string => item !== null);
    if (items.length === 0) continue;
    intervals.push({ miles, km: Number.isFinite(km) && km > 0 ? km : null, items });
  }

  if (intervals.length === 0) return null;
  intervals.sort((a, b) => a.miles - b.miles);
  return intervals;
}

async function callVehicleDatabases<T>(
  path: string,
  apiKey: string,
  map: (payload: unknown) => T | null,
  fetchFn: FetchFn,
): Promise<VehicleDataResult<T>> {
  let response: Response;
  try {
    response = await fetchFn(`https://api.vehicledatabases.com${path}`, {
      headers: {
        "x-AuthKey": apiKey,
        Authorization: apiKey,
        Accept: "application/json",
      },
    });
  } catch {
    return { success: false, error: "Vehicle data lookup failed" };
  }
  if (!response.ok) return { success: false, error: "Vehicle data lookup failed" };

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { success: false, error: "Vehicle data lookup failed" };
  }

  const value = map(payload);
  return value === null
    ? { success: false, error: "Vehicle data not found" }
    : { success: true, value };
}

export function fetchOilLookup(
  vin: string,
  apiKey: string,
  fetchFn: FetchFn = fetch,
): Promise<VehicleDataResult<DataCenterSpecs>> {
  return callVehicleDatabases(
    `/oil-lookup/${encodeURIComponent(vin)}`,
    apiKey,
    (payload) => mapOilLookupResponse(payload),
    fetchFn,
  );
}

export function fetchFluidSpecs(
  vin: string,
  apiKey: string,
  fetchFn: FetchFn = fetch,
): Promise<VehicleDataResult<DataCenterSpecs>> {
  return callVehicleDatabases(
    `/fluid-specs/${encodeURIComponent(vin)}`,
    apiKey,
    (payload) => mapFluidSpecsResponse(payload),
    fetchFn,
  );
}

export function fetchMaintenanceSchedule(
  vin: string,
  apiKey: string,
  fetchFn: FetchFn = fetch,
): Promise<VehicleDataResult<MaintenanceInterval[]>> {
  return callVehicleDatabases(
    `/vehicle-maintenance/v4/${encodeURIComponent(vin)}`,
    apiKey,
    (payload) => mapMaintenanceResponse(payload),
    fetchFn,
  );
}

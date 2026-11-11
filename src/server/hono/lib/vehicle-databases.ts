/**
 * Vehicle Databases plate decode (plate-decode build, 2026-11-11).
 *
 * The old plate decoder ran on Vehicle Databases
 * (vehicledatabases.com) behind the VEHICLE_DATABASES_API_KEY
 * secret; the Hono migration left the route a dead stub. This
 * module is the provider half: a pure response mapper plus the
 * outbound call, kept separate from the route so both are testable
 * without a network.
 *
 * US plate lookup contract: GET /license-decode/{plate}/{state}
 * with the key in the x-AuthKey header (the provider docs also show
 * an Authorization header — both are sent). The US response carries
 * six fields: VIN, License, State, Make, Model, Year.
 */

export interface PlateDecodeVehicle {
  vin: string;
  make: string;
  model: string;
  year: number;
}

export interface VinDecodeVehicle {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  engine: string | null;
  transmission: string | null;
  driveType: string | null;
  fuelType: string | null;
  bodyClass: string | null;
}

export type PlateDecodeResult =
  | { success: true; vehicle: PlateDecodeVehicle }
  | { success: false; error: string };

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/** Read a field from a provider object, tolerating key casing. */
function field(obj: Record<string, unknown>, name: string): unknown {
  const wanted = name.toLowerCase();
  for (const key of Object.keys(obj)) {
    if (key.toLowerCase() === wanted) return obj[key];
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringField(obj: Record<string, unknown> | null, ...names: string[]): string | null {
  if (!obj) return null;
  for (const name of names) {
    const value = field(obj, name);
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function numberField(obj: Record<string, unknown> | null, ...names: string[]): number | null {
  if (!obj) return null;
  for (const name of names) {
    const value = field(obj, name);
    const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

/** Map the documented flat or `data.basic` Vehicle Databases VIN response. */
export function mapVehicleDatabasesVinResponse(payload: unknown):
  | { success: true; vehicle: VinDecodeVehicle }
  | { success: false; error: string } {
  const root = asRecord(payload);
  const data = asRecord(root ? field(root, "data") : null);
  if (!root) return { success: false, error: "Vehicle not found" };

  const basic = asRecord(data ? field(data, "basic") : null) ?? asRecord(field(root, "basic"));
  const intro = asRecord(data ? field(data, "intro") : null) ?? asRecord(field(root, "intro"));
  const engineData = asRecord(data ? field(data, "engine") : null) ?? asRecord(field(root, "engine"));
  const candidates = [data, root];
  const pickString = (key: string, nested?: Record<string, unknown> | null) =>
    stringField(nested, key) ?? candidates.map((item) => stringField(item, key)).find(Boolean) ?? null;
  const vin = stringField(intro, "vin") ?? pickString("vin");
  const year = numberField(basic, "year") ?? candidates.map((item) => numberField(item, "year")).find((value) => value !== null) ?? null;
  const make = pickString("make", basic);
  const model = pickString("model", basic);
  if (!vin || !year || !make || !model) return { success: false, error: "Vehicle not found" };

  return {
    success: true,
    vehicle: {
      vin: vin.trim().toUpperCase(),
      year,
      make,
      model,
      trim: pickString("trim", basic),
      engine: pickString("engine") ?? stringField(engineData, "engine_description", "engine_size"),
      transmission: pickString("transmission", engineData),
      driveType: pickString("drivetrain", engineData) ?? pickString("drive_type", engineData),
      fuelType: pickString("fuel_type", engineData),
      bodyClass: pickString("body_class", basic) ?? pickString("body_type", basic),
    },
  };
}

/**
 * Map a Vehicle Databases response body onto the caller contract
 * ({ vin, make, model, year }). The body may carry the vehicle at
 * the top level or nested under `data`; anything without a usable
 * VIN + year is "not found", never a partial invention.
 */
export function mapVehicleDatabasesResponse(payload: unknown): PlateDecodeResult {
  const root = asRecord(payload);
  if (!root) return { success: false, error: "Vehicle not found" };

  const data = asRecord(field(root, "data"));
  const basic = asRecord(data ? field(data, "basic") : null);
  const intro = asRecord(data ? field(data, "intro") : null);
  const candidates = [root, data, basic].filter(
    (c): c is Record<string, unknown> => c !== null,
  );

  for (const candidate of candidates) {
    const vinRaw = field(intro ?? candidate, "vin") ?? field(candidate, "vin");
    const yearRaw = field(candidate, "year");
    const vin = typeof vinRaw === "string" ? vinRaw.trim().toUpperCase() : "";
    const year = typeof yearRaw === "number" ? yearRaw : Number.parseInt(String(yearRaw ?? ""), 10);
    if (!vin || !Number.isFinite(year) || year <= 0) continue;
    const makeRaw = field(candidate, "make");
    const modelRaw = field(candidate, "model");
    return {
      success: true,
      vehicle: {
        vin,
        make: typeof makeRaw === "string" ? makeRaw.trim() : "",
        model: typeof modelRaw === "string" ? modelRaw.trim() : "",
        year,
      },
    };
  }

  return { success: false, error: "Vehicle not found" };
}

export async function decodePlateWithVehicleDatabases(
  plate: string,
  state: string,
  apiKey: string,
  fetchFn: FetchFn = fetch,
): Promise<PlateDecodeResult> {
  const url =
    `https://api.vehicledatabases.com/license-decode/` +
    `${encodeURIComponent(plate)}/${encodeURIComponent(state)}`;

  let response: Response;
  try {
    response = await fetchFn(url, {
      headers: {
        "x-AuthKey": apiKey,
        Authorization: apiKey,
        Accept: "application/json",
      },
    });
  } catch {
    return { success: false, error: "Plate lookup failed" };
  }

  if (!response.ok) {
    return {
      success: false,
      error: response.status === 404 ? "Vehicle not found" : "Plate lookup failed",
    };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { success: false, error: "Plate lookup failed" };
  }

  return mapVehicleDatabasesResponse(payload);
}

/** Decode a 17-character VIN through the same Vehicle Databases integration. */
export async function decodeVinWithVehicleDatabases(
  vin: string,
  apiKey: string,
  fetchFn: FetchFn = fetch,
): Promise<ReturnType<typeof mapVehicleDatabasesVinResponse>> {
  const url = `https://api.vehicledatabases.com/vin-decode/${encodeURIComponent(vin.trim().toUpperCase())}`;
  let response: Response;
  try {
    response = await fetchFn(url, {
      headers: {
        "x-AuthKey": apiKey,
        Authorization: apiKey,
        Accept: "application/json",
      },
    });
  } catch {
    return { success: false, error: "VIN decode failed" };
  }

  if (!response.ok) {
    return { success: false, error: response.status === 400 || response.status === 404 ? "Vehicle not found" : "VIN decode failed" };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { success: false, error: "VIN decode failed" };
  }
  return mapVehicleDatabasesVinResponse(payload);
}

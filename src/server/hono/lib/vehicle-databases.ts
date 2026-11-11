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

/**
 * Map a Vehicle Databases response body onto the caller contract
 * ({ vin, make, model, year }). The body may carry the vehicle at
 * the top level or nested under `data`; anything without a usable
 * VIN + year is "not found", never a partial invention.
 */
export function mapVehicleDatabasesResponse(payload: unknown): PlateDecodeResult {
  const root = asRecord(payload);
  if (!root) return { success: false, error: "Vehicle not found" };

  const candidates = [root, asRecord(root.data)].filter(
    (c): c is Record<string, unknown> => c !== null,
  );

  for (const candidate of candidates) {
    const vinRaw = field(candidate, "vin");
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

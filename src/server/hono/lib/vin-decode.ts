/**
 * NHTSA vPIC VIN decode (Data Center build, 2026-11-11).
 *
 * The platform VIN decoder behind VEHICLE_DATABASES_API_KEY was never
 * reachable for a plain VIN (POST /v1/vin/decode is still a provider
 * stub), so the Data Center resolves a bare VIN through NHTSA vPIC —
 * the free, keyless federal decoder. Pure mapper plus the outbound
 * call, kept separate from the route so both are testable without a
 * network (the vehicle-databases.ts pattern).
 *
 * vPIC decodevin answers { Results: [{ Variable, Value }] }; anything
 * without a usable year + make + model is "not found", never a
 * partial invention.
 */

export interface DecodedVehicle {
  vin: string;
  year: number;
  make: string;
  model: string;
  engine: string | null;
}

export type VinDecodeResult =
  | { success: true; vehicle: DecodedVehicle }
  | { success: false; error: string };

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function valueFor(results: unknown, variable: string): string {
  if (!Array.isArray(results)) return "";
  for (const entry of results) {
    const row = asRecord(entry);
    if (!row || row.Variable !== variable) continue;
    const value = row.Value;
    return typeof value === "string" ? value.trim() : "";
  }
  return "";
}

/** Map a vPIC decodevin body onto the Data Center vehicle shape. */
export function mapVpicDecodeResponse(vin: string, payload: unknown): VinDecodeResult {
  const root = asRecord(payload);
  if (!root) return { success: false, error: "Vehicle not found" };
  const results = root.Results;

  const year = Number.parseInt(valueFor(results, "Model Year"), 10);
  const make = valueFor(results, "Make");
  const model = valueFor(results, "Model");
  if (!Number.isFinite(year) || year <= 0 || !make || !model) {
    return { success: false, error: "Vehicle not found" };
  }

  const displacement = valueFor(results, "Displacement (L)");
  const cylinders = valueFor(results, "Engine Number of Cylinders");
  let engine: string | null = null;
  if (displacement) {
    const liters = Number.parseFloat(displacement);
    if (Number.isFinite(liters) && liters > 0) {
      engine = cylinders ? `${liters.toFixed(1)}L ${cylinders}-cyl` : `${liters.toFixed(1)}L`;
    }
  }

  return {
    success: true,
    vehicle: { vin: vin.trim().toUpperCase(), year, make, model, engine },
  };
}

/** Decode a VIN through NHTSA vPIC. Never throws. */
export async function decodeVinWithNhtsa(
  vin: string,
  fetchFn: FetchFn = fetch,
): Promise<VinDecodeResult> {
  const clean = vin.trim().toUpperCase();
  try {
    const response = await fetchFn(
      `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${encodeURIComponent(clean)}?format=json`,
    );
    if (!response.ok) return { success: false, error: "Vehicle not found" };
    return mapVpicDecodeResponse(clean, await response.json().catch(() => null));
  } catch {
    return { success: false, error: "Vehicle not found" };
  }
}

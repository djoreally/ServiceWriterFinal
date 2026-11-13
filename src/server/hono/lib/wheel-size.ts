/**
 * Wheel-Size fitment lookup (Data Center build, 2026-11-11).
 *
 * Tire size + pressure for the tech-app Data Center come from the
 * Wheel-Size developer API (developer.wheel-size.com), per the owner's
 * ruling: GET /v2/modifications/?make=&model=&year= with the account
 * key as the `user_key` query parameter (their documented auth).
 * The front (OE/stock) fitment wins; only values the API literally
 * returned are mapped — no size or pressure is ever composed.
 */

export interface WheelSizeFitment {
  tireSize: string | null;
  tirePressurePsi: number | null;
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Wheel-Size addresses makes/models by slug ("Land Rover" -> "land-rover"). */
export function wheelSizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function axleTire(axle: unknown): { size: string | null; psi: number | null } {
  const record = asRecord(axle);
  if (!record) return { size: null, psi: null };
  const full = typeof record.tire_full === "string" ? record.tire_full.trim() : "";
  const plain = typeof record.tire === "string" ? record.tire.trim() : "";
  const pressure = asRecord(record.tire_pressure);
  const psi =
    pressure && typeof pressure.psi === "number" && Number.isFinite(pressure.psi) && pressure.psi > 0
      ? pressure.psi
      : null;
  return { size: full || plain || null, psi };
}

/**
 * Map a /v2/modifications/ body onto the Data Center tire fields.
 * Stock (OE) wheel entries are preferred; the first literal size and
 * the first literal pressure found win, independently.
 */
export function mapWheelSizeModifications(payload: unknown): WheelSizeFitment {
  const root = asRecord(payload);
  const modifications = root && Array.isArray(root.data) ? root.data : [];

  let tireSize: string | null = null;
  let tirePressurePsi: number | null = null;

  const orderedWheels: Record<string, unknown>[] = [];
  for (const mod of modifications) {
    const modRecord = asRecord(mod);
    const wheels = modRecord && Array.isArray(modRecord.wheels) ? modRecord.wheels : [];
    const parsed = wheels
      .map((w) => asRecord(w))
      .filter((w): w is Record<string, unknown> => w !== null);
    orderedWheels.push(...parsed.filter((w) => w.is_stock === true));
    orderedWheels.push(...parsed.filter((w) => w.is_stock !== true));
  }

  for (const wheel of orderedWheels) {
    const front = axleTire(wheel.front);
    const rear = axleTire(wheel.rear);
    if (!tireSize) tireSize = front.size ?? rear.size;
    if (tirePressurePsi === null) tirePressurePsi = front.psi ?? rear.psi;
    if (tireSize && tirePressurePsi !== null) break;
  }

  return { tireSize, tirePressurePsi };
}

/** Fetch fitment for a year/make/model. Never throws; nulls when unavailable. */
export async function fetchWheelSizeFitment(
  vehicle: { year: number; make: string; model: string },
  apiKey: string,
  fetchFn: FetchFn = fetch,
): Promise<WheelSizeFitment> {
  const empty: WheelSizeFitment = { tireSize: null, tirePressurePsi: null };
  const params = new URLSearchParams({
    make: wheelSizeSlug(vehicle.make),
    model: wheelSizeSlug(vehicle.model),
    year: String(vehicle.year),
    user_key: apiKey,
  });
  try {
    const response = await fetchFn(`https://api.wheel-size.com/v2/modifications/?${params.toString()}`);
    if (!response.ok) return empty;
    return mapWheelSizeModifications(await response.json().catch(() => null));
  } catch {
    return empty;
  }
}

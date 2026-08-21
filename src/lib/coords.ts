/**
 * Coordinate guards for Mapbox.
 *
 * Mapbox throws `Invalid LngLat object: (NaN, NaN)` and refuses to render the
 * whole map when a single pin receives a non-numeric coordinate. Rows coming
 * from JSONB columns (`technicians.current_location`) or nullable numeric
 * columns (`appointments.location_lat`) can be strings, null, or absent, so
 * every coordinate must be normalized before it reaches the map.
 */

/** Parse an unknown value into a finite number, or null. */
export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** True when the pair is a renderable [lng, lat] within valid Earth ranges. */
export function isValidLngLat(lng: unknown, lat: unknown): boolean {
  const lngNum = toFiniteNumber(lng);
  const latNum = toFiniteNumber(lat);
  if (lngNum === null || latNum === null) return false;
  if (lngNum === 0 && latNum === 0) return false; // null-island placeholder
  return lngNum >= -180 && lngNum <= 180 && latNum >= -90 && latNum <= 90;
}

/** Normalize an arbitrary location-ish object into `{ lat, lng }` or null. */
export function normalizeLatLng(value: unknown): { lat: number; lng: number } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const lat = toFiniteNumber(record.lat ?? record.latitude);
  const lng = toFiniteNumber(record.lng ?? record.lon ?? record.longitude);
  if (lat === null || lng === null) return null;
  if (!isValidLngLat(lng, lat)) return null;
  return { lat, lng };
}

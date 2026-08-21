export interface ServiceAreaRule {
  id: string;
  label?: string;
  address?: string;
  coordinates?: { lat: number; lng: number } | null;
  radius_miles?: number;
  days?: string[];
  allow_overlap?: boolean;
  split_policy?: "allow" | "prefer_primary" | "manual_review";
}

const toRad = (v: number) => (v * Math.PI) / 180;

export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 3958.8;
  const dLat = toRad(a.lat - b.lat);
  const dLon = toRad(a.lng - b.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(b.lat)) * Math.cos(toRad(a.lat)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function matchServiceAreas(
  customerCoords: { lat: number; lng: number } | null | undefined,
  areas: ServiceAreaRule[] | null | undefined,
): ServiceAreaRule[] {
  if (!customerCoords || !areas?.length) return [];
  return areas.filter((area) => {
    if (!area.coordinates || !area.radius_miles) return false;
    return milesBetween(customerCoords, area.coordinates) <= area.radius_miles;
  });
}

export function deriveWorkingDaysFromAreas(areas: ServiceAreaRule[]): string[] | null {
  if (!areas.length) return null;
  const titleCase = (d: string) => {
    const lower = String(d || "").toLowerCase();
    return lower ? `${lower.charAt(0).toUpperCase()}${lower.slice(1)}` : lower;
  };
  const days = new Set<string>();
  areas.forEach((area) => (area.days || []).forEach((day) => days.add(titleCase(day))));
  return Array.from(days);
}

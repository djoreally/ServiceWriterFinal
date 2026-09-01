/** Service-category policy for public booking fitment and provider context. */
export type VehicleSelectorKind = "ymm_engine" | "wheel_tire" | "none";
export type BookingRequirement = "basic_vehicle" | "oil_fitment" | "tire_fitment" | "tire_quantity" | "detailing_assessment";

export interface ServiceCategoryPolicyRow {
  id: string;
  name: string;
  parent_id: string | null;
  vehicle_selector: VehicleSelectorKind;
  shows_fluid_specs: boolean;
  booking_requirements?: BookingRequirement[];
}

export interface ResolvedCategoryPolicy {
  vehicleSelector: VehicleSelectorKind;
  showsFluidSpecs: boolean;
  matched: boolean;
  requirements: BookingRequirement[];
}

export const DEFAULT_CATEGORY_POLICY: ResolvedCategoryPolicy = {
  vehicleSelector: "ymm_engine",
  showsFluidSpecs: false,
  matched: false,
  requirements: ["basic_vehicle"],
};

const OIL_KEYWORDS = /\b(oil|lube|lubrication|fluids?|oil[_ -]?fluids?)\b/i;
const TIRE_KEYWORDS = /\b(tire|tires|tyre|wheel|wheels|tpms|rotation)\b/i;
const DETAILING_KEYWORDS = /\b(detail|detailing|wash|ceramic|coating|wax|polish|interior|exterior|tint)\b/i;

function normalize(value: string): string { return value.trim().toLowerCase().replaceAll("_", " "); }

export function resolveCategoryPolicy(rows: ServiceCategoryPolicyRow[], categoryKeys: Array<string | null | undefined>): ResolvedCategoryPolicy {
  const keys = categoryKeys.map((key) => key ? normalize(key) : "").filter(Boolean);
  if (keys.length === 0) return DEFAULT_CATEGORY_POLICY;

  const byKey = new Map<string, ServiceCategoryPolicyRow>();
  for (const row of rows) { byKey.set(normalize(row.id), row); byKey.set(normalize(row.name), row); }

  const matchedRows: ServiceCategoryPolicyRow[] = [];
  const unmatched: string[] = [];
  for (const key of keys) { const row = byKey.get(key); if (row) matchedRows.push(row); else unmatched.push(key); }

  const inferredOil = unmatched.some((key) => OIL_KEYWORDS.test(key));
  const inferredTire = unmatched.some((key) => TIRE_KEYWORDS.test(key));
  const inferredDetailing = unmatched.some((key) => DETAILING_KEYWORDS.test(key));

  const requirements = new Set<BookingRequirement>();
  let matchedOil = false;
  let matchedTire = false;
  let matchedDetailing = false;
  for (const row of matchedRows) {
    const rowRequirements = row.booking_requirements ?? [];
    rowRequirements.forEach((requirement) => requirements.add(requirement));
    if (row.shows_fluid_specs || rowRequirements.includes("oil_fitment")) matchedOil = true;
    if (row.vehicle_selector === "wheel_tire" || rowRequirements.includes("tire_fitment")) matchedTire = true;
    if (rowRequirements.includes("detailing_assessment")) matchedDetailing = true;
    if (rowRequirements.length === 0) requirements.add("basic_vehicle");
  }

  if (inferredOil) { requirements.add("basic_vehicle"); requirements.add("oil_fitment"); }
  if (inferredTire) { requirements.add("basic_vehicle"); requirements.add("tire_fitment"); }
  if (inferredDetailing) { requirements.add("basic_vehicle"); requirements.add("detailing_assessment"); }
  if (requirements.size === 0) requirements.add("basic_vehicle");

  const needsOil = matchedOil || inferredOil;
  const needsTire = matchedTire || inferredTire;
  const needsDetailing = matchedDetailing || inferredDetailing;

  return {
    // Combined oil+tire bookings keep the authoritative YMM+engine selector and
    // append tire fitment. Pure tire bookings use the wheel/tire selector.
    vehicleSelector: needsTire && !needsOil ? "wheel_tire" : "ymm_engine",
    showsFluidSpecs: needsOil,
    matched: matchedRows.length > 0,
    requirements: Array.from(requirements),
  };
}

export function shouldShowFluidSpecs(policy: ResolvedCategoryPolicy | undefined): boolean { return policy?.showsFluidSpecs ?? false; }

export function applyProviderVerticalDefault(policy: ResolvedCategoryPolicy, verticals: string[] | null | undefined): ResolvedCategoryPolicy {
  if (policy.matched || policy.requirements.some((requirement) => requirement !== "basic_vehicle")) return policy;
  const list = (verticals ?? []).map(normalize).filter(Boolean);
  if (list.length === 0) return policy;
  const hasOil = list.some((value) => value === "oil change" || value === "oil_change" || value === "mechanical");
  const hasTires = list.includes("tires") || list.includes("tire");
  const hasDetailing = list.includes("detailing") || list.includes("detail");
  const requirements = new Set<BookingRequirement>(policy.requirements);
  if (hasOil) requirements.add("oil_fitment");
  if (hasTires) requirements.add("tire_fitment");
  if (hasDetailing) requirements.add("detailing_assessment");
  return {
    vehicleSelector: hasTires && !hasOil ? "wheel_tire" : "ymm_engine",
    showsFluidSpecs: hasOil,
    matched: false,
    requirements: Array.from(requirements),
  };
}

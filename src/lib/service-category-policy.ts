/**
 * Service Category Policy
 *
 * Single source of truth for category-driven vehicle UX:
 *  - which vehicle selector a category uses (standard YMM+engine vs the wheel/tire configurator)
 *  - whether oil / fluid specifications may be shown at all
 *
 * Tire categories are pre-wired to the wheel/tire configurator and never display
 * oil or fluid information. Detailing categories keep the YMM selector but also
 * suppress fluid specs.
 */

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
  /** True when at least one selected category resolved against a known row. */
  matched: boolean;
  requirements: BookingRequirement[];
}

export const DEFAULT_CATEGORY_POLICY: ResolvedCategoryPolicy = {
  vehicleSelector: "ymm_engine",
  showsFluidSpecs: true,
  matched: false,
  requirements: ["basic_vehicle"],
};

const TIRE_KEYWORDS = /\b(tire|tires|tyre|wheel|wheels|tpms|rotation)\b/i;
const NO_FLUID_KEYWORDS = /\b(detail|detailing|wash|ceramic|coating|wax|polish|interior|exterior|tint)\b/i;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Resolve the policy for a set of selected category keys.
 * Keys may be category ids (`tires_service`) or display names (`Tire Service`).
 */
export function resolveCategoryPolicy(
  rows: ServiceCategoryPolicyRow[],
  categoryKeys: Array<string | null | undefined>,
): ResolvedCategoryPolicy {
  const keys = categoryKeys
    .map((key) => (key ? normalize(key) : ""))
    .filter((key) => key.length > 0);

  if (keys.length === 0) return DEFAULT_CATEGORY_POLICY;

  const byKey = new Map<string, ServiceCategoryPolicyRow>();
  for (const row of rows) {
    byKey.set(normalize(row.id), row);
    byKey.set(normalize(row.name), row);
  }

  const matchedRows: ServiceCategoryPolicyRow[] = [];
  const unmatched: string[] = [];
  for (const key of keys) {
    const row = byKey.get(key);
    if (row) matchedRows.push(row);
    else unmatched.push(key);
  }

  if (matchedRows.length > 0) {
    return {
      vehicleSelector: matchedRows.some((r) => r.vehicle_selector === "wheel_tire")
        ? "wheel_tire"
        : matchedRows.every((r) => r.vehicle_selector === "none")
          ? "none"
          : "ymm_engine",
      // Fluid specs stay hidden unless at least one selected category allows them.
      showsFluidSpecs: matchedRows.some((r) => r.shows_fluid_specs),
      matched: true,
      requirements: Array.from(new Set(matchedRows.flatMap((row) => row.booking_requirements ?? [row.vehicle_selector === "wheel_tire" ? "tire_fitment" : "basic_vehicle"]))) as BookingRequirement[],
    };
  }

  // Keyword fallback for free-text categories that predate the category table.
  const isTire = unmatched.some((key) => TIRE_KEYWORDS.test(key));
  const noFluid = isTire || unmatched.some((key) => NO_FLUID_KEYWORDS.test(key));

  if (isTire || noFluid) {
    return {
      vehicleSelector: isTire ? "wheel_tire" : "ymm_engine",
      showsFluidSpecs: !noFluid,
      matched: false,
      requirements: isTire ? ["tire_fitment"] : ["basic_vehicle", "detailing_assessment"],
    };
  }

  return DEFAULT_CATEGORY_POLICY;
}

/** Convenience guard used by spec/fluid UI surfaces. */
export function shouldShowFluidSpecs(policy: ResolvedCategoryPolicy | undefined): boolean {
  return policy?.showsFluidSpecs ?? true;
}

/**
 * Provider-vertical default.
 *
 * When a shop declares its verticals during onboarding (`business_profiles.service_verticals`),
 * the public booking flow should already behave correctly BEFORE any service is
 * selected: a tire-only shop opens with the wheel/tire configurator, and a
 * tire/detailing-only shop never shows oil or fluid information.
 *
 * A category match always wins — this only fills in the unmatched default.
 */
export function applyProviderVerticalDefault(
  policy: ResolvedCategoryPolicy,
  verticals: string[] | null | undefined,
): ResolvedCategoryPolicy {
  if (policy.matched) return policy;
  const list = (verticals ?? []).map((v) => normalize(v)).filter(Boolean);
  if (list.length === 0) return policy;

  const hasFluidVertical = list.some((v) => v === "oil_change" || v === "mechanical");
  const hasTires = list.includes("tires");

  return {
    vehicleSelector: !hasFluidVertical && hasTires ? "wheel_tire" : policy.vehicleSelector,
    showsFluidSpecs: hasFluidVertical ? policy.showsFluidSpecs : false,
    matched: policy.matched,
    requirements: !hasFluidVertical && hasTires
      ? Array.from(new Set([...policy.requirements, "tire_fitment" as BookingRequirement]))
      : policy.requirements,
  };
}

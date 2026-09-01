/**
 * Service Category Policy Query
 *
 * The legacy service_categories table is not part of the production canonical
 * schema. Public service rows already carry category/category_id and the policy
 * resolver has deterministic keyword/category fallbacks. Keep only stable
 * built-in vertical categories here so booking never performs a guaranteed 404.
 */
import type { ServiceCategoryPolicyRow } from "@/lib/service-category-policy";

const BUILTIN_POLICIES: ServiceCategoryPolicyRow[] = [
  { id: "oil_fluids", name: "Oil & Fluids", parent_id: null, vehicle_selector: "ymm_engine", shows_fluid_specs: true, booking_requirements: ["basic_vehicle", "oil_fitment"] },
  { id: "oil_change", name: "Oil Change", parent_id: null, vehicle_selector: "ymm_engine", shows_fluid_specs: true, booking_requirements: ["basic_vehicle", "oil_fitment"] },
  { id: "tires", name: "Tires", parent_id: null, vehicle_selector: "wheel_tire", shows_fluid_specs: false, booking_requirements: ["basic_vehicle", "tire_fitment"] },
  { id: "tire_service", name: "Tire Service", parent_id: null, vehicle_selector: "wheel_tire", shows_fluid_specs: false, booking_requirements: ["basic_vehicle", "tire_fitment"] },
  { id: "detailing", name: "Detailing", parent_id: null, vehicle_selector: "ymm_engine", shows_fluid_specs: false, booking_requirements: ["basic_vehicle", "detailing_assessment"] },
];

export async function fetchServiceCategoryPolicies(): Promise<ServiceCategoryPolicyRow[]> {
  return BUILTIN_POLICIES;
}

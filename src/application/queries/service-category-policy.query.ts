/**
 * Service Category Policy Query — reads category hierarchy + behavior flags.
 */
import { supabase } from "@/integrations/supabase/client";
import type { BookingRequirement, ServiceCategoryPolicyRow, VehicleSelectorKind } from "@/lib/service-category-policy";

export async function fetchServiceCategoryPolicies(): Promise<ServiceCategoryPolicyRow[]> {
  const { data, error } = await supabase
    .from("service_categories")
    .select("id, name, parent_id, vehicle_selector, shows_fluid_specs, booking_requirements")
    .order("sort_order");

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    parent_id: (row as { parent_id: string | null }).parent_id ?? null,
    vehicle_selector: ((row as { vehicle_selector: string }).vehicle_selector ?? "ymm_engine") as VehicleSelectorKind,
    shows_fluid_specs: (row as { shows_fluid_specs: boolean }).shows_fluid_specs ?? true,
    booking_requirements: (((row as { booking_requirements?: string[] }).booking_requirements ?? ["basic_vehicle"]) as BookingRequirement[]),
  }));
}

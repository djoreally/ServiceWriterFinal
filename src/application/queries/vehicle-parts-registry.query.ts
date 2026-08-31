/**
 * Vehicle Parts Registry Query — per-vehicle part numbers for fleet and retail vehicles,
 * plus suggestion resolution (assigned parts first, shared spec reference as fallback).
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export type VehicleKind = "fleet" | "retail";

export const PART_CATEGORIES: Array<{ value: string; label: string }> = [
  { value: "oil", label: "Motor Oil" },
  { value: "oil_filter", label: "Oil Filter" },
  { value: "air_filter", label: "Engine Air Filter" },
  { value: "cabin_filter", label: "Cabin Air Filter" },
  { value: "fuel_filter", label: "Fuel Filter" },
  { value: "transmission_filter", label: "Transmission Filter" },
  { value: "wiper_blade_driver", label: "Wiper (Driver)" },
  { value: "wiper_blade_passenger", label: "Wiper (Passenger)" },
  { value: "wiper_blade_rear", label: "Wiper (Rear)" },
  { value: "drain_plug_gasket", label: "Drain Plug / Gasket" },
  { value: "other", label: "Other" },
];

export function partCategoryLabel(value: string): string {
  return PART_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export interface VehiclePartAssignment {
  id: string;
  vehicle_kind: VehicleKind;
  fleet_vehicle_id: string | null;
  vehicle_id: string | null;
  part_category: string;
  part_number: string;
  brand: string | null;
  oem_number: string | null;
  quantity: number;
  unit: string | null;
  inventory_item_id: string | null;
  is_required: boolean;
  notes: string | null;
  verified_at: string | null;
  created_at: string;
}

export interface PartSuggestion {
  part_category: string;
  part_number: string;
  brand: string | null;
  oem_number: string | null;
  quantity: number;
  inventory_item_id: string | null;
  is_required: boolean;
  source: "assigned" | "spec_reference";
}

export async function fetchVehiclePartAssignments(
  kind: VehicleKind,
  vehicleId: string,
): Promise<VehiclePartAssignment[]> {
  const column = kind === "fleet" ? "fleet_vehicle_id" : "vehicle_id";
  const { data, error } = await (supabase as any)
    .from("vehicle_part_assignments")
    .select("*")
    .eq(column, vehicleId)
    .order("part_category");

  if (error) throw new Error(error.message);
  return (data ?? []) as VehiclePartAssignment[];
}

/** Assigned parts, or shared spec-reference fallback when the vehicle has none. */
export async function fetchVehiclePartSuggestions(
  kind: VehicleKind,
  vehicleId: string,
): Promise<PartSuggestion[]> {
  const { data, error } = await (supabase as any).rpc("get_vehicle_part_suggestions_v1", {
    p_vehicle_kind: kind,
    p_vehicle_id: vehicleId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as PartSuggestion[];
}

export interface StockOption {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  unit: string;
  quantity: number;
  sell_price: number;
  unit_cost: number;
}

export async function fetchStockOptions(): Promise<StockOption[]> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return [];
  const { data, error } = await (supabase as any)
    .from("inventory_items")
    .select("id, name, sku, category, unit, quantity, sell_price, unit_cost")
    .eq("user_id", user.id)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as StockOption[];
}

export interface VanStockRow {
  van_id: string;
  van_name: string;
  inventory_item_id: string;
  quantity: number;
  min_quantity: number | null;
}

/** Van-level availability for the workspace, used to source parts from the right van. */
export async function fetchVanStock(): Promise<VanStockRow[]> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return [];

  const { data: vans } = await supabase
    .from("vans")
    .select("id, name")
    .eq("user_id", user.id)
    .eq("is_active", true);

  const vanIds = (vans ?? []).map((v) => v.id);
  if (vanIds.length === 0) return [];

  const { data: rows, error } = await supabase
    .from("van_inventory")
    .select("van_id, inventory_item_id, quantity, min_quantity")
    .in("van_id", vanIds);
  if (error) throw new Error(error.message);

  const nameById = new Map((vans ?? []).map((v) => [v.id, v.name]));
  return (rows ?? []).map((r) => ({
    van_id: r.van_id,
    van_name: nameById.get(r.van_id) ?? "Van",
    inventory_item_id: r.inventory_item_id,
    quantity: Number(r.quantity ?? 0),
    min_quantity: r.min_quantity == null ? null : Number(r.min_quantity),
  }));
}

export interface WorkOrderPartLine {
  id: string;
  description: string;
  part_number: string | null;
  quantity: number;
  unit_price: number;
  total: number;
  inventory_item_id: string | null;
  van_id: string | null;
  fleet_vehicle_id: string | null;
}

export async function fetchWorkOrderPartLines(workOrderId: string): Promise<WorkOrderPartLine[]> {
  const { data, error } = await (supabase as any)
    .from("fleet_work_order_line_items")
    .select("id, description, part_number, quantity, unit_price, total, inventory_item_id, van_id, fleet_vehicle_id")
    .eq("fleet_work_order_id", workOrderId)
    .eq("line_type", "part")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as WorkOrderPartLine[];
}

export interface PartReservationRow {
  id: string;
  inventory_item_id: string;
  quantity: number;
  status: string;
  van_id: string | null;
  notes: string | null;
}

export async function fetchWorkOrderPartReservations(workOrderId: string): Promise<PartReservationRow[]> {
  const { data, error } = await (supabase as any)
    .from("inventory_reservations")
    .select("id, inventory_item_id, quantity, status, van_id, notes")
    .eq("work_order_id", workOrderId)
    .eq("source", "fleet_work_order_parts");
  if (error) throw new Error(error.message);
  return (data ?? []) as PartReservationRow[];
}

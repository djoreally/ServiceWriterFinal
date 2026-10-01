/**
 * Vehicle Parts Registry Query — per-vehicle part numbers for fleet and retail vehicles,
 * plus suggestion resolution (assigned parts first, shared spec reference as fallback).
 */
import { apiClient } from "@/lib/api-client";

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
  const { data } = await apiClient.get<{ data: VehiclePartAssignment[] }>("/v1/vehicle-part-assignments", {
    query: { kind, vehicle_id: vehicleId },
  });
  return data ?? [];
}

/** Assigned parts, or shared spec-reference fallback when the vehicle has none. */
export async function fetchVehiclePartSuggestions(
  kind: VehicleKind,
  vehicleId: string,
): Promise<PartSuggestion[]> {
  const { data } = await apiClient.post<{ data: PartSuggestion[] }>("/v1/vehicle-part-suggestions", {
    kind,
    vehicle_id: vehicleId,
  });
  return data ?? [];
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
  const { data } = await apiClient.get<{ data: StockOption[] }>("/v1/inventory/stock-options");
  return data ?? [];
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
  const { data } = await apiClient.get<{ data: VanStockRow[] }>("/v1/vans/stock");
  return data ?? [];
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
  const { data } = await apiClient.get<{ data: WorkOrderPartLine[] }>(`/v1/work-orders/${workOrderId}/part-lines`);
  return data ?? [];
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
  const { data } = await apiClient.get<{ data: PartReservationRow[] }>(`/v1/work-orders/${workOrderId}/part-reservations`);
  return data ?? [];
}

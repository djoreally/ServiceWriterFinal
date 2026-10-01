/**
 * Fleet Vehicle Profile — Data access for the fleet vehicle profile page.
 */
import { apiClient } from "@/lib/api-client";
import type { Database } from "@/integrations/supabase/types";

export type FleetVehicleProfileRow = Database["public"]["Tables"]["fleet_vehicles"]["Row"] & {
  fleet_clients: { id: string; company_name: string } | null;
  fleet_locations: { id: string; name: string } | null;
  fleet_contracts: { id: string; name: string } | null;
};

export type FleetVehicleWorkOrderRow = Pick<
  Database["public"]["Tables"]["fleet_work_orders"]["Row"],
  "id" | "order_number" | "status" | "service_type" | "scheduled_date" | "total" | "completed_at"
>;

async function rawGet<T>(path: string): Promise<{ data: T | null; error: unknown }> {
  try {
    const { data } = await apiClient.get<{ data: T }>(path);
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

export async function fetchFleetVehicleProfile(vehicleId: string) {
  return rawGet<FleetVehicleProfileRow>(`/v1/fleet/vehicles/${vehicleId}/profile`);
}

export async function fetchFleetVehicleWorkOrders(vehicleId: string) {
  return rawGet<FleetVehicleWorkOrderRow[]>(`/v1/fleet/vehicles/${vehicleId}/work-orders`);
}

export async function fetchVehicleSpecMatch(year: number, make: string, model: string) {
  const params = new URLSearchParams({ year: String(year), make, model });
  return rawGet<Database["public"]["Tables"]["vehicle_specifications"]["Row"] | null>(
    `/v1/vehicle-specs/match?${params.toString()}`,
  );
}

export type VehicleSpecificationUpsert = {
  id?: string;
  year: number;
  make: string;
  model: string;
  engine?: string | null;
  oil_capacity?: string | null;
  oil_type?: string | null;
  oil_filter?: string | null;
  air_filter?: string | null;
  cabin_filter?: string | null;
  fuel_filter?: string | null;
  brake_fluid?: string | null;
  coolant_type?: string | null;
  transmission_fluid?: string | null;
  tire_size?: string | null;
  wiper_blade_driver?: string | null;
  wiper_blade_passenger?: string | null;
  wiper_blade_rear?: string | null;
};

export async function saveVehicleSpecification(payload: VehicleSpecificationUpsert) {
  try {
    if (payload.id) {
      const { id, ...spec } = payload;
      const { data } = await apiClient.patch<{ data: unknown }>(`/v1/vehicle-specs/${id}`, { payload: spec });
      return { data, error: null };
    }
    const { data } = await apiClient.post<{ data: unknown }>("/v1/vehicle-specs", { payload });
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

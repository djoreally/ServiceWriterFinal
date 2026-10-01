/**
 * Fleet Check-In Query - Read operations for the fleet check-in page.
 */

import { apiClient } from "@/lib/api-client";

export interface FleetCheckInWorkOrder {
  id: string;
  order_number: string;
  service_type: string;
  description: string | null;
  priority: string;
  status: string;
  scheduled_date: string;
  scheduled_time: string | null;
  sla_deadline: string | null;
  fleet_clients: { company_name: string } | null;
  fleet_vehicles: { year: number; make: string; model: string; unit_number: string | null; license_plate: string | null } | null;
  fleet_locations: { name: string; address: string | null; city: string | null; state: string | null } | null;
}

export interface FleetCheckInRecord {
  id: string;
  fleet_work_order_id: string;
  checkin_type: string;
  lat: number | null;
  lng: number | null;
  accuracy_meters: number | null;
  notes: string | null;
  created_at: string;
}

export async function fetchTodayWorkOrders(userId: string): Promise<{
  workOrders: FleetCheckInWorkOrder[];
  checkins: Record<string, FleetCheckInRecord[]>;
}> {
  const { data } = await apiClient.get<{
    data: { workOrders: FleetCheckInWorkOrder[]; checkins: Record<string, FleetCheckInRecord[]> };
  }>("/v1/fleet/checkin/today");
  return { workOrders: data?.workOrders ?? [], checkins: data?.checkins ?? {} };
}

/**
 * Refresh work orders after a check-in action.
 */
export async function refreshWorkOrders(userId: string): Promise<FleetCheckInWorkOrder[]> {
  const { data } = await apiClient.get<{ data: FleetCheckInWorkOrder[] }>("/v1/fleet/checkin/refresh");
  return data ?? [];
}

/**
 * Refresh checkins for a single work order.
 */
export async function refreshCheckins(workOrderId: string, userId: string): Promise<FleetCheckInRecord[]> {
  const { data } = await apiClient.get<{ data: FleetCheckInRecord[] }>(
    `/v1/fleet/checkin/checkins/${workOrderId}`,
  );
  return data ?? [];
}

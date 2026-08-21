/**
 * Fleet Check-In Query - Read operations for the fleet check-in page.
 */

import { supabase } from "@/integrations/supabase/client";

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

const WORK_ORDER_SELECT = `
  id, order_number, service_type, description, priority, status,
  scheduled_date, scheduled_time, sla_deadline,
  fleet_clients(company_name),
  fleet_vehicles(year, make, model, unit_number, license_plate),
  fleet_locations(name, address, city, state)
`;

export async function fetchTodayWorkOrders(userId: string): Promise<{
  workOrders: FleetCheckInWorkOrder[];
  checkins: Record<string, FleetCheckInRecord[]>;
}> {
  const today = new Date().toISOString().split("T")[0];

  const { data } = await supabase
    .from("fleet_work_orders")
    .select(WORK_ORDER_SELECT)
    .eq("user_id", userId)
    .in("status", ["scheduled", "in_progress", "assigned", "pending_review"])
    .gte("scheduled_date", today)
    .order("scheduled_date")
    .order("scheduled_time");

  const orders = (data ?? []) as unknown as FleetCheckInWorkOrder[];

  // ⚡ Batch fetch all checkins in one query instead of N+1
  const grouped: Record<string, FleetCheckInRecord[]> = {};
  if (orders.length > 0) {
    const ids = orders.map((o) => o.id);
    const { data: ciData } = await supabase
      .from("fleet_checkins")
      .select("*")
      .in("fleet_work_order_id", ids)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    for (const ci of (ciData ?? []) as FleetCheckInRecord[]) {
      if (!grouped[ci.fleet_work_order_id]) grouped[ci.fleet_work_order_id] = [];
      grouped[ci.fleet_work_order_id].push(ci);
    }
  }

  return { workOrders: orders, checkins: grouped };
}

/**
 * Refresh work orders after a check-in action.
 */
export async function refreshWorkOrders(userId: string): Promise<FleetCheckInWorkOrder[]> {
  const today = new Date().toISOString().split("T")[0];
  const { data } = await supabase
    .from("fleet_work_orders")
    .select(WORK_ORDER_SELECT)
    .eq("user_id", userId)
    .in("status", ["scheduled", "in_progress"])
    .gte("scheduled_date", today)
    .order("scheduled_date")
    .order("scheduled_time");
  return (data ?? []) as unknown as FleetCheckInWorkOrder[];
}

/**
 * Refresh checkins for a single work order.
 */
export async function refreshCheckins(workOrderId: string, userId: string): Promise<FleetCheckInRecord[]> {
  const { data } = await supabase
    .from("fleet_checkins")
    .select("*")
    .eq("fleet_work_order_id", workOrderId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return (data ?? []) as FleetCheckInRecord[];
}

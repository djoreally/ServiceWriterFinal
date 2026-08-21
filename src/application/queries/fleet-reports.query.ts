/**
 * Fleet Reports Query - Data fetching for the Fleet Reports page.
 */

import { supabase } from "@/integrations/supabase/client";

export interface FleetReportStats {
  totalSpend: number;
  vehicleCount: number;
  locationCount: number;
  avgCostPerVehicle: number;
  openApprovals: number;
  overdueVehicles: number;
  poOpenCount: number;
  invoicesPending: number;
}

export interface FleetTopVehicleSpendItem {
  total: number;
  vehicle: { year: number; make: string; model: string; unit_number: string | null } | null;
}

export interface FleetReportPageData {
  stats: FleetReportStats;
  topVehicles: FleetTopVehicleSpendItem[];
}

/** Fetch all data needed for the fleet reports page. */
export async function fetchFleetReportPageData(userId: string): Promise<FleetReportPageData> {
  const [vehiclesRes, locationsRes, woRes, posRes] = await Promise.all([
    supabase.from("fleet_vehicles").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("fleet_locations").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("fleet_work_orders")
      .select("id, total, status, fleet_vehicle_id, invoice_status, fleet_vehicles(year, make, model, unit_number)")
      .eq("user_id", userId),
    (supabase as any).from("fleet_purchase_orders")
      .select("id, status", { count: "exact" })
      .eq("user_id", userId)
      .in("status", ["open", "partially_used"]),
  ]);

  const allOrders = woRes.data ?? [];
  const completedOrders = allOrders.filter((o: any) => ["completed", "invoiced", "paid"].includes(o.status));
  const totalSpend = completedOrders.reduce((sum: number, o: any) => sum + (o.total || 0), 0);
  const vehicleCount = vehiclesRes.count ?? 0;
  const pendingInvoices = allOrders.filter(
    (o: any) => (o.invoice_status || "pending") === "pending" && o.status === "completed"
  ).length;

  // Top vehicles by spend
  const vehicleSpend: Record<string, { total: number; vehicle: any }> = {};
  completedOrders.forEach((o: any) => {
    if (!o.fleet_vehicle_id) return;
    if (!vehicleSpend[o.fleet_vehicle_id]) {
      vehicleSpend[o.fleet_vehicle_id] = { total: 0, vehicle: o.fleet_vehicles };
    }
    vehicleSpend[o.fleet_vehicle_id].total += o.total || 0;
  });
  const topVehicles = Object.values(vehicleSpend)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5) as FleetTopVehicleSpendItem[];

  return {
    stats: {
      totalSpend,
      vehicleCount,
      locationCount: locationsRes.count ?? 0,
      avgCostPerVehicle: vehicleCount > 0 ? totalSpend / vehicleCount : 0,
      openApprovals: 0,
      overdueVehicles: 0,
      poOpenCount: posRes.count ?? 0,
      invoicesPending: pendingInvoices,
    },
    topVehicles,
  };
}

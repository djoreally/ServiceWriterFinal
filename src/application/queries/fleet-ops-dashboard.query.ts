/**
 * Fleet OS Operations Center — dashboard aggregation query.
 *
 * Single Promise.all fan-out that returns everything the operations
 * center dashboard renders: KPIs, today's schedule, customer attention,
 * work order pipeline, technician status, revenue, PM forecast,
 * customer health, and inventory signals.
 *
 * No schema changes: uses fleet_clients, fleet_vehicles, fleet_work_orders,
 * fleet_service_schedules, technicians, time_clock_entries, inventory_items.
 */


import { apiClient } from "@/lib/api-client";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FleetOpsKpis {
  todayJobs: number;
  todayRevenue: number;
  vehiclesScheduledToday: number;
  fleetCustomers: number;
  techniciansWorking: number;
  overduePms: number;
  outstandingInvoices: number;
  fleetHealth: number; // 0-100
}

export interface FleetOpsScheduleItem {
  id: string;
  time: string | null;
  clientName: string;
  vehicleCount: number;
  technicianName: string | null;
  status: string;
  total: number;
  locationName: string | null;
  eta: string | null;
}

export interface FleetOpsAttentionClient {
  fleetClientId: string;
  clientName: string;
  overdue: number;
  dueThisWeek: number;
  upcoming: number;
  awaitingApproval: number;
}

export interface FleetOpsPipeline {
  new: number;
  assigned: number;
  traveling: number;
  onSite: number;
  waitingApproval: number;
  completed: number;
  invoiced: number;
}

export interface FleetOpsTechnicianRow {
  id: string;
  name: string;
  status: string;
  currentLocation: { lat: number; lng: number } | null;
  currentJob: {
    id: string;
    clientName: string | null;
    scheduledTime: string | null;
  } | null;
  clockedIn: boolean;
}

export interface FleetOpsRevenue {
  scheduledToday: number;
  completedToday: number;
  pendingApproval: number;
  outstanding: number;
}

export interface FleetOpsForecast {
  today: number;
  thisWeek: number;
  nextWeek: number;
  thirtyDays: number;
}

export interface FleetOpsHealthCard {
  fleetClientId: string;
  clientName: string;
  vehicleCount: number;
  pmCompliance: number; // 0-100
  outstandingAr: number;
  lastVisit: string | null;
  lifetimeRevenue: number;
  monthlyAverage: number;
}

export interface FleetOpsInventoryRow {
  id: string;
  name: string;
  category: string | null;
  quantity: number;
  threshold: number;
  unit: string;
}

export interface FleetOpsInventory {
  oil: FleetOpsInventoryRow[];
  filters: FleetOpsInventoryRow[];
  drainPlugs: FleetOpsInventoryRow[];
  supplies: FleetOpsInventoryRow[];
  totalLow: number;
}

export interface FleetOpsDashboard {
  kpis: FleetOpsKpis;
  todaySchedule: FleetOpsScheduleItem[];
  attention: FleetOpsAttentionClient[];
  pipeline: FleetOpsPipeline;
  technicians: FleetOpsTechnicianRow[];
  revenue: FleetOpsRevenue;
  forecast: FleetOpsForecast;
  health: FleetOpsHealthCard[];
  inventory: FleetOpsInventory;
}

// ─── Main fetcher ───────────────────────────────────────────────────────────

export async function fetchFleetOpsDashboard(userId: string): Promise<FleetOpsDashboard> {
  const { data } = await apiClient.get<{ data: FleetOpsDashboard }>("/v1/fleet/ops-dashboard");
  return data as FleetOpsDashboard;
}

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { getOfflineDatabase } from "@/offline/database";
import { isOfflineEligibleForCurrentUser } from "@/offline/rollout";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface FleetDashboardStats {
  totalClients: number;
  totalVehicles: number;
  openWorkOrders: number;
  completedThisMonth: number;
  monthlyRevenue: number;
  overdueOrders: number;
  vehiclesDueThisWeek: number;
  pendingInvoiceTotal: number;
  openPOs: number;
}

export type FleetWorkOrderStatus =
  | "draft"
  | "pending_review"
  | "scheduled"
  | "assigned"
  | "en_route"
  | "arrived"
  | "in_progress"
  | "completed"
  | "invoiced"
  | "paid";

export type FleetWorkOrderRow = Database["public"]["Tables"]["fleet_work_orders"]["Row"];

export interface FleetWorkOrderSummary extends FleetWorkOrderRow {
  fleet_vehicles?: {
    year: number | null;
    make: string | null;
    model: string | null;
    unit_number: string | null;
  } | null;
  fleet_clients?: {
    company_name: string | null;
  } | null;
  fleet_locations?: {
    name: string | null;
    city?: string | null;
    state?: string | null;
  } | null;
  fleet_jobs?: {
    id: string;
    job_number: string | null;
  } | null;
}

export interface FleetDashboardData {
  stats: FleetDashboardStats;
  recentOrders: FleetWorkOrderSummary[];
  scheduledOrders: FleetWorkOrderSummary[];
}

export interface FleetVanSummary {
  id: string;
  name: string;
  vin: string | null;
  license_plate: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  status: string;
  is_active: boolean;
  assigned_technician_id: string | null;
  technician_name?: string | null;
  territory_count?: number;
  inventory_count?: number;
}

export interface FleetTechnicianSummary {
  id: string;
  name: string;
}

type VanTerritoryRow = Pick<Database["public"]["Tables"]["van_territories"]["Row"], "van_id">;
type VanInventoryRow = Pick<Database["public"]["Tables"]["van_inventory"]["Row"], "van_id">;
type VanRow = Database["public"]["Tables"]["vans"]["Row"];

// FleetWorkOrderRow already exported above (line 24)

export interface FleetWorkOrderDetail extends FleetWorkOrderRow {
  fleet_vehicles?: {
    id: string;
    year: number | null;
    make: string | null;
    model: string | null;
    unit_number: string | null;
    vin: string | null;
    mileage: number | null;
    license_plate: string | null;
  } | null;
  fleet_clients?: {
    id: string;
    company_name: string | null;
  } | null;
  fleet_contracts?: {
    id: string;
    name: string | null;
    sla_hours: number | null;
    approval_threshold: number | null;
  } | null;
  fleet_locations?: {
    id: string;
    name: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
  } | null;
  technicians?: {
    id: string;
    name: string | null;
    status: string | null;
    last_location_update: string | null;
  } | null;
}

export type FleetWorkOrderLineItem = Database["public"]["Tables"]["fleet_work_order_line_items"]["Row"];
export type FleetActivityLog = Database["public"]["Tables"]["fleet_activity_logs"]["Row"];
export type FleetApproval = Database["public"]["Tables"]["fleet_approvals"]["Row"];

export interface FleetClientSummary {
  id: string;
  company_name: string;
  status: string;
  phone: string | null;
  billing_email: string | null;
  payment_terms: string;
  fleet_vehicles?: { id: string }[] | null;
  fleet_work_orders?: { id: string }[] | null;
}

export interface FleetVehicleListItem {
  id: string;
  year: number | null;
  make: string | null;
  model: string | null;
  unit_number: string | null;
  vin: string | null;
  fleet_client_id: string | null;
  fleet_location_id: string | null;
  fleet_contract_id: string | null;
  created_at: string | null;
  license_plate: string | null;
  mileage: number | null;
  status: string;
  fleet_clients?: { company_name: string | null } | null;
  fleet_locations?: { name: string | null } | null;
  fleet_contracts?: { name: string | null } | null;
}

export interface FleetLocationSummary {
  id: string;
  fleet_client_id?: string | null;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code?: string | null;
  is_primary?: boolean | null;
  service_window_start?: string | null;
  service_window_end?: string | null;
  site_contact_name?: string | null;
  site_contact_phone?: string | null;
  access_instructions?: string | null;
  fleet_clients?: { company_name: string | null } | null;
}

export interface FleetPurchaseOrderSummary {
  id: string;
  po_number: string | null;
  description?: string | null;
  amount_limit: number | null;
  amount_used: number | null;
  status: string | null;
  issued_date?: string | null;
  expiry_date?: string | null;
  fleet_clients?: { company_name: string | null } | null;
}

export interface FleetContactSummary {
  id: string;
  name: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  is_primary?: boolean | null;
  can_approve_work?: boolean | null;
  receives_invoices?: boolean | null;
  receives_reports?: boolean | null;
  fleet_clients?: { company_name: string | null } | null;
}

export interface FleetContractSummary {
  id: string;
  name: string | null;
  is_active: boolean | null;
  sla_hours?: number | null;
  approval_threshold?: number | null;
  invoice_frequency?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  pricing_rules?: unknown;
  fleet_clients?: { company_name: string | null } | null;
}

export interface FleetInvoiceSummary {
  id: string;
  order_number: string | null;
  po_number: string | null;
  status: string;
  invoice_status: string | null;
  total: number | null;
  completed_at: string | null;
  fleet_clients?: { company_name: string | null } | null;
  fleet_vehicles?: {
    year: number | null;
    make: string | null;
    model: string | null;
    unit_number: string | null;
  } | null;
}

/**
 * Fleet OS dashboard data
 * Centralizes the Supabase calls used by the FleetOS command center.
 */
export async function fetchFleetDashboardData(userId: string): Promise<FleetDashboardData> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const today = now.toISOString().split("T")[0];

  const [
    clientsRes,
    vehiclesRes,
    openWoRes,
    completedRes,
    recentRes,
    scheduledRes,
    dueVehiclesRes,
    pendingInvRes,
    posRes,
  ] = await Promise.all([
    supabase
      .from("fleet_clients")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "active"),
    supabase.from("fleet_vehicles").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase
      .from("fleet_work_orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", ["draft", "scheduled", "in_progress"]),
    supabase
      .from("fleet_work_orders")
      .select("id, total", { count: "exact" })
      .eq("user_id", userId)
      .eq("status", "completed")
      .gte("completed_at", monthStart),
    supabase
      .from("fleet_work_orders")
      .select(
        "*, fleet_vehicles(year, make, model, unit_number), fleet_clients(company_name)"
      )
      .eq("user_id", userId)
      .in("status", ["completed", "invoiced"])
      .order("completed_at", { ascending: false })
      .limit(5),
    supabase
      .from("fleet_work_orders")
      .select(
        "*, fleet_vehicles(year, make, model, unit_number), fleet_clients(company_name)"
      )
      .eq("user_id", userId)
      .eq("status", "scheduled")
      .lte("scheduled_date", weekFromNow)
      .order("scheduled_date")
      .limit(5),
    supabase
      .from("fleet_work_orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "scheduled")
      .lte("scheduled_date", today),
    supabase
      .from("fleet_work_orders")
      .select("total")
      .eq("user_id", userId)
      .eq("status", "completed")
      .eq("invoice_status", "pending"),
    supabase
      .from("fleet_purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", ["open", "partially_used"]),
  ]);

  const monthlyTotal =
    (completedRes.data as { total: number | null }[] | null)?.reduce(
      (sum, o) => sum + (o.total || 0),
      0
    ) ?? 0;

  const pendingInvTotal =
    (pendingInvRes.data as { total: number | null }[] | null)?.reduce(
      (sum, o) => sum + (o.total || 0),
      0
    ) ?? 0;

  return {
    stats: {
      totalClients: clientsRes.count ?? 0,
      totalVehicles: vehiclesRes.count ?? 0,
      openWorkOrders: openWoRes.count ?? 0,
      completedThisMonth: completedRes.count ?? 0,
      monthlyRevenue: monthlyTotal,
      overdueOrders: dueVehiclesRes.count ?? 0,
      vehiclesDueThisWeek: (scheduledRes.data as FleetWorkOrderSummary[] | null)?.length ?? 0,
      pendingInvoiceTotal: pendingInvTotal,
      openPOs: posRes.count ?? 0,
    },
    recentOrders: (recentRes.data as FleetWorkOrderSummary[] | null) ?? [],
    scheduledOrders: (scheduledRes.data as FleetWorkOrderSummary[] | null) ?? [],
  };
}

/**
 * List all fleet work orders for the current user.
 */
async function fetchFleetWorkOrdersFromOffline(): Promise<FleetWorkOrderSummary[]> {
  const database = getOfflineDatabase();
  if (!database) return [];

  const rows = await database.get('offline_fleet_work_orders').query().fetch();
  type OfflineWorkOrderRow = {
    _raw: {
      server_id?: string | null;
      order_number?: string | null;
      status?: string | null;
      priority?: string | null;
      scheduled_date?: string | null;
      service_type?: string | null;
      po_number?: string | null;
      total?: number | null;
      vehicle_server_id?: string | null;
      client_server_id?: string | null;
      updated_at_local: string;
    };
  };

  return (rows as unknown as OfflineWorkOrderRow[])
    .map((row) => ({
      id: row._raw.server_id,
      order_number: row._raw.order_number ?? null,
      status: row._raw.status ?? 'draft',
      priority: row._raw.priority ?? 'normal',
      scheduled_date: row._raw.scheduled_date ?? null,
      service_type: row._raw.service_type ?? null,
      po_number: row._raw.po_number ?? null,
      total: row._raw.total ?? 0,
      fleet_vehicle_id: row._raw.vehicle_server_id ?? null,
      fleet_client_id: row._raw.client_server_id ?? null,
      user_id: '',
      created_at: new Date(row._raw.updated_at_local).toISOString(),
      updated_at: new Date(row._raw.updated_at_local).toISOString(),
      fleet_vehicles: null,
      fleet_clients: null,
    }) as unknown as FleetWorkOrderSummary)
    .filter((row) => Boolean(row.id && row.status && row.id !== ''))
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
}

export async function fetchFleetWorkOrders(
  userId: string
): Promise<FleetWorkOrderSummary[]> {
  const { data, error } = await supabase
    .from("fleet_work_orders")
    .select(
      "*, fleet_vehicles(year, make, model, unit_number), fleet_clients(company_name), fleet_locations(name, address, city, state), fleet_jobs(id, job_number)"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    console.error("[fetchFleetWorkOrders] Error:", error);
    if (await isOfflineEligibleForCurrentUser()) {
      return fetchFleetWorkOrdersFromOffline();
    }
    return [];
  }

  return data as FleetWorkOrderSummary[];
}

export interface FleetWorkOrderPageResult {
  rows: FleetWorkOrderSummary[];
  total: number;
  counts: Record<string, number>;
  aggregates: { open: number; active: number; priority: number };
}

export async function fetchFleetWorkOrdersPage(input: { userId: string; page: number; pageSize: number; search?: string; status?: string; clientId?: string; sort?: string }): Promise<FleetWorkOrderPageResult> {
  const openStatuses = ["draft", "pending_review", "scheduled", "assigned", "en_route", "arrived", "in_progress"];
  let query = supabase.from("fleet_work_orders").select(fleetSchedulerSelect, { count: "exact" }).eq("user_id", input.userId);
  if (input.status) query = query.eq("status", input.status);
  if (input.clientId) query = query.eq("fleet_client_id", input.clientId);
  if (input.search?.trim()) {
    const value = input.search.trim().replace(/[,%()]/g, "");
    query = query.or(`order_number.ilike.%${value}%,po_number.ilike.%${value}%,service_type.ilike.%${value}%`);
  }
  const sort = input.sort ?? "scheduled_desc";
  const column = sort.startsWith("created") ? "created_at" : "scheduled_date";
  query = query.order(column, { ascending: sort.endsWith("asc"), nullsFirst: false }).range((input.page - 1) * input.pageSize, input.page * input.pageSize - 1);
  const statuses = ["draft", "pending_review", "scheduled", "assigned", "en_route", "arrived", "in_progress", "completed", "invoiced", "paid"];
  const [page, open, active, priority, ...statusResults] = await Promise.all([
    query,
    supabase.from("fleet_work_orders").select("id", { count: "exact", head: true }).eq("user_id", input.userId).in("status", openStatuses),
    supabase.from("fleet_work_orders").select("id", { count: "exact", head: true }).eq("user_id", input.userId).in("status", ["assigned", "en_route", "arrived", "in_progress"]),
    supabase.from("fleet_work_orders").select("id", { count: "exact", head: true }).eq("user_id", input.userId).in("priority", ["high", "urgent"]).in("status", openStatuses),
    ...statuses.map((status) => supabase.from("fleet_work_orders").select("id", { count: "exact", head: true }).eq("user_id", input.userId).eq("status", status)),
  ]);
  if (page.error) throw page.error;
  return {
    rows: (page.data ?? []) as FleetWorkOrderSummary[], total: page.count ?? 0,
    counts: Object.fromEntries(statuses.map((status, index) => [status, statusResults[index].count ?? 0])),
    aggregates: { open: open.count ?? 0, active: active.count ?? 0, priority: priority.count ?? 0 },
  };
}

export interface FleetSchedulerWindow {
  scheduled: FleetWorkOrderSummary[];
  unscheduled: FleetWorkOrderSummary[];
  counts: { scheduled: number; unscheduled: number; exceptions: number };
}

const fleetSchedulerSelect = "*, fleet_vehicles(year, make, model, unit_number), fleet_clients(company_name), fleet_locations(name, address, city, state), fleet_jobs(id, job_number)";

/** Date-windowed scheduler payload plus a bounded, separate unscheduled queue. */
export async function fetchFleetSchedulerWindow(userId: string, startDate: string, endDate: string): Promise<FleetSchedulerWindow> {
  const openStatuses = ["draft", "pending_review", "scheduled", "assigned", "en_route", "arrived", "in_progress"];
  const [scheduled, unscheduled, scheduledCount, unscheduledCount, exceptionsCount] = await Promise.all([
    supabase.from("fleet_work_orders").select(fleetSchedulerSelect).eq("user_id", userId).gte("scheduled_date", startDate).lte("scheduled_date", endDate).in("status", openStatuses).order("scheduled_date").order("scheduled_time").limit(500),
    supabase.from("fleet_work_orders").select(fleetSchedulerSelect).eq("user_id", userId).is("scheduled_date", null).in("status", openStatuses).order("created_at", { ascending: false }).limit(100),
    supabase.from("fleet_work_orders").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("scheduled_date", startDate).lte("scheduled_date", endDate).in("status", openStatuses),
    supabase.from("fleet_work_orders").select("id", { count: "exact", head: true }).eq("user_id", userId).is("scheduled_date", null).in("status", openStatuses),
    supabase.from("fleet_work_orders").select("id", { count: "exact", head: true }).eq("user_id", userId).or("priority.eq.urgent,status.eq.pending_review").in("status", openStatuses),
  ]);
  if (scheduled.error) throw scheduled.error;
  if (unscheduled.error) throw unscheduled.error;
  return {
    scheduled: (scheduled.data ?? []) as FleetWorkOrderSummary[],
    unscheduled: (unscheduled.data ?? []) as FleetWorkOrderSummary[],
    counts: { scheduled: scheduledCount.count ?? 0, unscheduled: unscheduledCount.count ?? 0, exceptions: exceptionsCount.count ?? 0 },
  };
}

/** Invalidates only the scheduler window when a work-order row changes. */
export function subscribeToFleetScheduler(userId: string, onInvalidate: () => void): () => void {
  const channel = supabase.channel(`fleet-scheduler-${userId}`).on("postgres_changes", {
    event: "*", schema: "public", table: "fleet_work_orders", filter: `user_id=eq.${userId}`,
  }, onInvalidate).subscribe();
  return () => { void supabase.removeChannel(channel); };
}

export function subscribeToFleetList(userId: string, table: "fleet_work_orders" | "fleet_vehicles", onInvalidate: () => void): () => void {
  const channel = supabase.channel(`${table}-page-${userId}`).on("postgres_changes", {
    event: "*", schema: "public", table, filter: `user_id=eq.${userId}`,
  }, onInvalidate).subscribe();
  return () => { void supabase.removeChannel(channel); };
}

/**
 * Fetch vans, technicians, and aggregate counts for the Fleet overview page.
 * Resolves the current user from auth internally.
 */
export async function fetchFleetVansOverview(): Promise<{
  vans: FleetVanSummary[];
  technicians: FleetTechnicianSummary[];
}> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) {
    throw new Error("You must be logged in to view fleet.");
  }

  const [vansRes, territoriesRes, inventoryRes, techRes] = await Promise.all([
    supabase
      .from("vans")
      .select("*")
      .eq("user_id", user.id)
      .order("name"),
    supabase.from("van_territories").select("van_id"),
    supabase.from("van_inventory").select("van_id"),
    supabase
      .from("technicians")
      .select("id, name")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("name"),
  ]);

  const technicians: FleetTechnicianSummary[] =
    (techRes.data as FleetTechnicianSummary[] | null) ?? [];

  const vansRaw: VanRow[] = vansRes.data ?? [];
  const territories: VanTerritoryRow[] = territoriesRes.data ?? [];
  const inventory: VanInventoryRow[] = inventoryRes.data ?? [];

  const techMap = new Map<string, string>();
  technicians.forEach((t) => techMap.set(t.id, t.name));

  const territoryMap = new Map<string, number>();
  territories.forEach((t) => {
    const key = String(t.van_id);
    territoryMap.set(key, (territoryMap.get(key) || 0) + 1);
  });

  const inventoryMap = new Map<string, number>();
  inventory.forEach((i) => {
    const key = String(i.van_id);
    inventoryMap.set(key, (inventoryMap.get(key) || 0) + 1);
  });

  const vans: FleetVanSummary[] = vansRaw.map((v) => {
    const id = String(v.id);
    return {
      id,
      name: v.name,
      vin: v.vin ?? null,
      license_plate: v.license_plate ?? null,
      make: v.make ?? null,
      model: v.model ?? null,
      year: v.year ?? null,
      status: v.status,
      is_active: v.is_active,
      assigned_technician_id: v.assigned_technician_id ?? null,
      technician_name:
        v.assigned_technician_id
          ? techMap.get(v.assigned_technician_id) ?? null
          : null,
      territory_count: territoryMap.get(id) || 0,
      inventory_count: inventoryMap.get(id) || 0,
    };
  });

  return { vans, technicians };
}

/**
 * List all fleet clients for the current user with simple stats
 * (vehicle and work order counts).
 */
export async function fetchFleetClients(): Promise<FleetClientSummary[]> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) {
    throw new Error("You must be logged in to view fleet clients.");
  }

  const { data, error } = await supabase
    .from("fleet_clients")
    .select(
      "id, company_name, status, phone, billing_email, payment_terms, fleet_vehicles(id), fleet_work_orders(id)"
    )
    .eq("user_id", user.id)
    .order("company_name");

  if (error || !data) {
    console.error("[fetchFleetClients] Error fetching fleet clients", error);
    return [];
  }

  return data as unknown as FleetClientSummary[];
}

/**
 * List all fleet vehicles for the current user with basic relations.
 */
export async function fetchFleetVehiclesList(): Promise<FleetVehicleListItem[]> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) {
    throw new Error("You must be logged in to view fleet vehicles.");
  }

  const { data, error } = await supabase
    .from("fleet_vehicles")
    .select(
      "id, year, make, model, unit_number, vin, license_plate, mileage, status, fleet_client_id, fleet_location_id, fleet_contract_id, created_at, fleet_clients(company_name), fleet_locations(name), fleet_contracts(name)"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error || !data) {
    console.error("[fetchFleetVehiclesList] Error fetching fleet vehicles", error);
    return [];
  }

  return data as unknown as FleetVehicleListItem[];
}

export interface FleetVehiclePageOptions {
  page: number;
  pageSize: number;
  search?: string;
  clientId?: string;
  status?: string;
  locationId?: string;
  contractId?: string;
  dataFilter?: "missing_vin" | "missing_location" | "missing_contract";
  sort?: "recent" | "client" | "unit" | "year_desc" | "mileage_desc";
}

export interface FleetVehiclePageResult {
  rows: FleetVehicleListItem[];
  total: number;
  aggregates: { total: number; active: number; maintenance: number; incomplete: number };
}

/** Server-filtered vehicle list with exact counts; no full fleet download. */
export async function fetchFleetVehiclesPage(options: FleetVehiclePageOptions): Promise<FleetVehiclePageResult> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("You must be logged in to view fleet vehicles.");
  const select = "id, year, make, model, unit_number, vin, license_plate, mileage, status, fleet_client_id, fleet_location_id, fleet_contract_id, created_at, fleet_clients(company_name), fleet_locations(name), fleet_contracts(name)";
  let query = supabase.from("fleet_vehicles").select(select, { count: "exact" }).eq("user_id", user.id);
  if (options.search?.trim()) {
    const value = options.search.trim().replace(/[,%()]/g, "");
    query = query.or(`vin.ilike.%${value}%,unit_number.ilike.%${value}%,license_plate.ilike.%${value}%,make.ilike.%${value}%,model.ilike.%${value}%`);
  }
  if (options.clientId) query = query.eq("fleet_client_id", options.clientId);
  if (options.status) query = query.eq("status", options.status);
  if (options.locationId) query = query.eq("fleet_location_id", options.locationId);
  if (options.contractId) query = query.eq("fleet_contract_id", options.contractId);
  if (options.dataFilter === "missing_vin") query = query.is("vin", null);
  if (options.dataFilter === "missing_location") query = query.is("fleet_location_id", null);
  if (options.dataFilter === "missing_contract") query = query.is("fleet_contract_id", null);
  const sortMap = {
    recent: ["created_at", false], client: ["fleet_client_id", true], unit: ["unit_number", true], year_desc: ["year", false], mileage_desc: ["mileage", false],
  } as const;
  const [sortColumn, ascending] = sortMap[options.sort ?? "recent"];
  query = query.order(sortColumn, { ascending }).range((options.page - 1) * options.pageSize, options.page * options.pageSize - 1);
  const [page, total, active, maintenance, incomplete] = await Promise.all([
    query,
    supabase.from("fleet_vehicles").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("fleet_vehicles").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "active"),
    supabase.from("fleet_vehicles").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "maintenance"),
    supabase.from("fleet_vehicles").select("id", { count: "exact", head: true }).eq("user_id", user.id).or("vin.is.null,mileage.is.null,fleet_location_id.is.null,fleet_contract_id.is.null"),
  ]);
  if (page.error) throw page.error;
  return { rows: (page.data ?? []) as FleetVehicleListItem[], total: page.count ?? 0, aggregates: { total: total.count ?? 0, active: active.count ?? 0, maintenance: maintenance.count ?? 0, incomplete: incomplete.count ?? 0 } };
}

/**
 * Options for the fleet vehicle creation form (clients, locations, contracts).
 */
export interface FleetVehicleFormOptions {
  clients: { id: string; company_name: string }[];
  locations: { id: string; name: string; city: string | null; state: string | null; fleet_client_id: string | null }[];
  contracts: { id: string; name: string; fleet_client_id: string | null }[];
  serviceProfiles: { id: string; service_class: string; fleet_client_id: string | null }[];
}

type FleetClientBasicRow = Pick<Database["public"]["Tables"]["fleet_clients"]["Row"], "id" | "company_name">;
type FleetLocationBasicRow = Pick<Database["public"]["Tables"]["fleet_locations"]["Row"], "id" | "name" | "city" | "state" | "fleet_client_id">;
type FleetContractBasicRow = Pick<Database["public"]["Tables"]["fleet_contracts"]["Row"], "id" | "name" | "fleet_client_id">;
type FleetServiceRuleBasicRow = Pick<Database["public"]["Tables"]["fleet_service_rules"]["Row"], "id" | "service_class" | "fleet_client_id">;

export async function fetchFleetVehicleFormOptions(): Promise<FleetVehicleFormOptions> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) {
    throw new Error("You must be logged in to manage fleet vehicles.");
  }

  const [clientsRes, locationsRes, contractsRes, serviceProfilesRes] = await Promise.all([
    supabase
      .from("fleet_clients")
      .select("id, company_name")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("company_name"),
    supabase
      .from("fleet_locations")
      .select("id, name, city, state, fleet_client_id")
      .eq("user_id", user.id)
      .order("name"),
    supabase
      .from("fleet_contracts")
      .select("id, name, fleet_client_id")
      .eq("user_id", user.id)
      .eq("is_active", true),
    supabase
      .from("fleet_service_rules")
      .select("id, service_class, fleet_client_id")
      .eq("user_id", user.id)
      .eq("is_active", true),
  ]);

  return {
    clients: (clientsRes.data as FleetClientBasicRow[] | null)?.map((c) => ({
      id: String(c.id),
      company_name: c.company_name,
    })) ?? [],
    locations: (locationsRes.data as FleetLocationBasicRow[] | null)?.map((l) => ({
      id: String(l.id),
      name: l.name,
      city: l.city ?? null,
      state: l.state ?? null,
      fleet_client_id: l.fleet_client_id ?? null,
    })) ?? [],
    contracts: (contractsRes.data as FleetContractBasicRow[] | null)?.map((c) => ({
      id: String(c.id),
      name: c.name,
      fleet_client_id: c.fleet_client_id ?? null,
    })) ?? [],
    serviceProfiles: (serviceProfilesRes.data as FleetServiceRuleBasicRow[] | null)?.map((r) => ({
      id: String(r.id),
      service_class: r.service_class,
      fleet_client_id: r.fleet_client_id ?? null,
    })) ?? [],
  };
}

export interface FleetWorkOrderCreateOptions {
  clients: { id: string; company_name: string }[];
  vehicles: {
    id: string;
    fleet_client_id: string | null;
    fleet_location_id: string | null;
    fleet_contract_id: string | null;
    year: number | null;
    make: string | null;
    model: string | null;
    unit_number: string | null;
    vin: string | null;
    mileage: number | null;
    license_plate: string | null;
    notes: string | null;
  }[];
  contracts: {
    id: string;
    fleet_client_id: string | null;
    name: string | null;
    sla_hours: number | null;
    approval_threshold: number | null;
    pricing_rules: unknown;
    is_active: boolean | null;
    start_date: string | null;
    end_date: string | null;
  }[];
  locations: {
    id: string;
    fleet_client_id: string | null;
    name: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    service_window_start: string | null;
    service_window_end: string | null;
  }[];
  serviceProfiles: {
    id: string;
    fleet_client_id: string | null;
    service_class: string;
    base_labor_package: string;
    interval_miles: number;
    interval_months: number;
    base_price: number;
    package_code: string | null;
    package_label: string | null;
    estimated_duration_minutes: number | null;
    includes: string[];
  }[];
  purchaseOrders: {
    id: string;
    fleet_client_id: string | null;
    po_number: string | null;
    amount_limit: number | null;
    amount_authorized: number | null;
    amount_consumed: number | null;
    amount_used: number | null;
    status: string | null;
  }[];
  contractServices: {
    id: string;
    fleet_contract_id: string;
    service_catalog_id: string | null;
    custom_price: number | null;
    custom_label: string | null;
    is_active: boolean;
    catalog_name: string | null;
    catalog_default_price: number | null;
  }[];
}

export interface FleetVehicleEligibility {
  fleet_vehicle_id: string;
  service_class: string;
  status: "on_track" | "due_soon" | "due" | "overdue" | string;
  due_date: string | null;
  due_mileage: number | null;
  base_labor_package: string | null;
  estimated_price: number | null;
  rule_id: string | null;
}

type FleetVehicleOptionRow = Pick<
  Database["public"]["Tables"]["fleet_vehicles"]["Row"],
  | "id"
  | "fleet_client_id"
  | "fleet_location_id"
  | "fleet_contract_id"
  | "year"
  | "make"
  | "model"
  | "unit_number"
  | "vin"
  | "mileage"
  | "license_plate"
  | "notes"
>;
type FleetContractOptionRow = Pick<
  Database["public"]["Tables"]["fleet_contracts"]["Row"],
  | "id"
  | "fleet_client_id"
  | "name"
  | "sla_hours"
  | "approval_threshold"
  | "pricing_rules"
  | "is_active"
  | "start_date"
  | "end_date"
>;
type FleetLocationOptionRow = Pick<
  Database["public"]["Tables"]["fleet_locations"]["Row"],
  "id" | "fleet_client_id" | "name" | "address" | "city" | "state" | "service_window_start" | "service_window_end"
>;
type FleetServiceRuleOptionRow = Pick<
  Database["public"]["Tables"]["fleet_service_rules"]["Row"],
  "id" | "fleet_client_id" | "service_class" | "base_labor_package" | "interval_miles" | "interval_months" | "base_price" | "package_code" | "package_label" | "estimated_duration_minutes" | "includes"
>;
type FleetPurchaseOrderOptionRow = Pick<
  Database["public"]["Tables"]["fleet_purchase_orders"]["Row"],
  "id" | "fleet_client_id" | "po_number" | "amount_limit" | "amount_authorized" | "amount_consumed" | "amount_used" | "status"
>;

export interface FleetWorkOrderDetailResult {
  order: FleetWorkOrderDetail | null;
  lineItems: FleetWorkOrderLineItem[];
  activityLogs: FleetActivityLog[];
  approvals: FleetApproval[];
}

export interface FleetReportStats {
  totalVehicles: number;
  activeLocations: number;
  openWorkOrders: number;
  completedThisMonth: number;
  purchaseOrdersOpen: number;
}

export interface FleetTopVehicleSpend {
  vehicleId: string;
  label: string;
  totalSpend: number;
}

export interface FleetReportsOverviewResult {
  stats: FleetReportStats;
  topVehicles: FleetTopVehicleSpend[];
}

export interface FleetCheckInRecord {
  id: string;
  created_at: string;
  type: string | null;
  notes?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  fleet_work_order_id: string | null;
}

export interface FleetTodayWorkOrdersResult {
  workOrders: FleetWorkOrderDetail[];
  checkinsByWorkOrderId: Record<string, FleetCheckInRecord[]>;
}

export interface FleetDomainSeparationHealth {
  fleetSchedulerVisibleCount: number;
  fleetMissingScheduleCount: number;
  legacyFleetAppointmentCount: number;
}

export async function fetchFleetLocations(): Promise<FleetLocationSummary[]> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("fleet_locations")
    .select(
      `id, fleet_client_id, name, address, city, state, postal_code, is_primary, service_window_start, service_window_end, site_contact_name, site_contact_phone, access_instructions, fleet_clients ( company_name )`
    )
    .eq("user_id", user.id)
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as FleetLocationSummary[];
}

export async function fetchFleetPurchaseOrders(): Promise<FleetPurchaseOrderSummary[]> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("fleet_purchase_orders")
    .select(
      `id, po_number, description, amount_limit, amount_used, status, issued_date, expiry_date, fleet_clients ( company_name )`
    )
    .eq("user_id", user.id)
    .order("issued_date", { ascending: false });

  if (error) throw error;
  return (data ?? []) as FleetPurchaseOrderSummary[];
}

export async function fetchFleetContacts(): Promise<FleetContactSummary[]> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("fleet_contacts")
    .select(
      `id, name, role, email, phone, is_primary, can_approve_work, receives_invoices, receives_reports, fleet_clients ( company_name )`
    )
    .eq("user_id", user.id)
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as FleetContactSummary[];
}

export async function fetchFleetContracts(): Promise<FleetContractSummary[]> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("fleet_contracts")
    .select(
      `id, name, is_active, sla_hours, approval_threshold, invoice_frequency, start_date, end_date, pricing_rules, fleet_clients ( company_name )`
    )
    .eq("user_id", user.id)
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as FleetContractSummary[];
}

export async function fetchFleetInvoices(): Promise<FleetInvoiceSummary[]> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("fleet_work_orders")
    .select(
      `id, order_number, po_number, status, invoice_status, total, completed_at, fleet_clients ( company_name ), fleet_vehicles ( year, make, model, unit_number )`
    )
    .eq("user_id", user.id)
    .in("status", ["completed", "invoiced", "paid"])
    .order("completed_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as FleetInvoiceSummary[];
}

export async function fetchFleetReportsOverview(): Promise<FleetReportsOverviewResult> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) throw new Error("Not authenticated");

  const [vehicles, locations, workOrders, purchaseOrders] = await Promise.all([
    supabase.from("fleet_vehicles").select("id").eq("user_id", user.id),
    supabase.from("fleet_locations").select("id").eq("user_id", user.id).eq("is_primary", true),
    supabase
      .from("fleet_work_orders")
      .select("id, status, completed_at, total, fleet_vehicle_id")
      .eq("user_id", user.id),
    supabase.from("fleet_purchase_orders").select("id, status").eq("user_id", user.id),
  ]);

  if (vehicles.error) throw vehicles.error;
  if (locations.error) throw locations.error;
  if (workOrders.error) throw workOrders.error;
  if (purchaseOrders.error) throw purchaseOrders.error;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const woData = (workOrders.data ?? []) as {
    id: string;
    status: string | null;
    completed_at: string | null;
    total: number | null;
    fleet_vehicle_id: string | null;
  }[];

  const stats: FleetReportStats = {
    totalVehicles: (vehicles.data ?? []).length,
    activeLocations: (locations.data ?? []).length,
    openWorkOrders: woData.filter((wo) => wo.status !== "completed" && wo.status !== "cancelled").length,
    completedThisMonth: woData.filter((wo) => {
      if (!wo.completed_at) return false;
      const completed = new Date(wo.completed_at);
      return completed >= startOfMonth && completed <= now;
    }).length,
    purchaseOrdersOpen: (purchaseOrders.data ?? []).filter((po) => po.status === "open").length,
  };

  const totalsByVehicle = new Map<string, { total: number; label: string }>();

  for (const wo of woData) {
    if (!wo.fleet_vehicle_id || !wo.total) continue;
    const existing = totalsByVehicle.get(wo.fleet_vehicle_id) ?? { total: 0, label: wo.fleet_vehicle_id };
    existing.total += wo.total;
    totalsByVehicle.set(wo.fleet_vehicle_id, existing);
  }

  const topVehicles: FleetTopVehicleSpend[] = Array.from(totalsByVehicle.entries())
    .map(([vehicleId, { total, label }]) => ({ vehicleId, label, totalSpend: total }))
    .sort((a, b) => b.totalSpend - a.totalSpend)
    .slice(0, 10);

  return { stats, topVehicles };
}

export async function fetchFleetTodayWorkOrdersWithCheckins(): Promise<FleetTodayWorkOrdersResult> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) throw new Error("Not authenticated");

  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

  const todayStr = today.toISOString().split("T")[0];

  const [workOrders, checkins] = await Promise.all([
    supabase
      .from("fleet_work_orders")
      .select(
        `id, order_number, status, scheduled_date, scheduled_time, scheduled_duration_minutes, fleet_vehicles ( id, unit_number, make, model, year ), fleet_clients ( company_name )`
      )
      .eq("user_id", user.id)
      .in("status", ["scheduled", "in_progress"])
      .eq("scheduled_date", todayStr)
      .order("scheduled_time", { ascending: true }),
    supabase
      .from("fleet_checkins")
      .select("id, created_at, type, notes, latitude, longitude, accuracy, fleet_work_order_id")
      .eq("user_id", user.id)
      .gte("created_at", startOfDay)
      .lt("created_at", endOfDay),
  ]);

  if (workOrders.error) throw workOrders.error;
  if (checkins.error) throw checkins.error;

  const workOrdersTyped = (workOrders.data ?? []) as unknown as FleetWorkOrderDetail[];
  const checkinsTyped = (checkins.data ?? []) as unknown as FleetCheckInRecord[];

  const checkinsByWorkOrderId: Record<string, FleetCheckInRecord[]> = {};
  for (const c of checkinsTyped) {
    const key = c.fleet_work_order_id ?? "";
    if (!key) continue;
    if (!checkinsByWorkOrderId[key]) checkinsByWorkOrderId[key] = [];
    checkinsByWorkOrderId[key].push(c);
  }

  return {
    workOrders: workOrdersTyped,
    checkinsByWorkOrderId,
  };
}

export async function fetchFleetWorkOrderCreateOptions(): Promise<FleetWorkOrderCreateOptions> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) {
    throw new Error("You must be logged in to create fleet work orders.");
  }
  const { data: workspaceOwner, error: workspaceError } = await (supabase as any).rpc("current_workspace_owner_user_id");
  if (workspaceError || !workspaceOwner) throw workspaceError ?? new Error("No active Fleet workspace.");
  const ownerId = String(workspaceOwner);

  const [clientsRes, vehiclesRes, contractsRes, locationsRes, posRes, serviceRulesRes, contractServicesRes] =
    await Promise.all([
      supabase
        .from("fleet_clients")
        .select("id, company_name, status")
        .eq("user_id", ownerId)
        .eq("status", "active")
        .order("company_name"),
      supabase
        .from("fleet_vehicles")
        .select(
          "id, fleet_client_id, fleet_location_id, fleet_contract_id, year, make, model, unit_number, vin, mileage, license_plate, notes, status"
        )
        .eq("user_id", ownerId)
        .eq("status", "active")
        .order("make"),
      supabase
        .from("fleet_contracts")
        .select(
          "id, fleet_client_id, name, sla_hours, approval_threshold, pricing_rules, is_active, start_date, end_date"
        )
        .eq("user_id", ownerId)
        .eq("is_active", true),
      supabase
        .from("fleet_locations")
        .select("id, fleet_client_id, name, address, city, state, service_window_start, service_window_end")
        .eq("user_id", ownerId),
      supabase
        .from("fleet_purchase_orders")
        .select(
          "id, fleet_client_id, po_number, amount_limit, amount_authorized, amount_consumed, amount_used, status"
        )
        .eq("user_id", ownerId)
        .in("status", ["open", "partially_used"]),
      supabase
        .from("fleet_service_rules")
        .select(
          "id, fleet_client_id, service_class, base_labor_package, interval_miles, interval_months, base_price, package_code, package_label, estimated_duration_minutes, includes"
        )
        .eq("user_id", ownerId)
        .eq("is_active", true),
      supabase
        .from("fleet_contract_services")
        .select(
          "id, fleet_contract_id, service_catalog_id, custom_price, custom_label, is_active, service_catalog(name, default_price)"
        )
        .eq("user_id", ownerId)
        .eq("is_active", true),
    ]);

  return {
    clients:
      (clientsRes.data as FleetClientBasicRow[] | null)?.map((c) => ({
        id: String(c.id),
        company_name: c.company_name,
      })) ?? [],
    vehicles:
      (vehiclesRes.data as FleetVehicleOptionRow[] | null)?.map((v) => ({
        id: String(v.id),
        fleet_client_id: v.fleet_client_id ?? null,
        fleet_location_id: v.fleet_location_id ?? null,
        fleet_contract_id: v.fleet_contract_id ?? null,
        year: v.year ?? null,
        make: v.make ?? null,
        model: v.model ?? null,
        unit_number: v.unit_number ?? null,
        vin: v.vin ?? null,
        mileage: v.mileage ?? null,
        license_plate: v.license_plate ?? null,
        notes: v.notes ?? null,
      })) ?? [],
    contracts:
      (contractsRes.data as FleetContractOptionRow[] | null)?.map((c) => ({
        id: String(c.id),
        fleet_client_id: c.fleet_client_id ?? null,
        name: c.name ?? null,
        sla_hours: c.sla_hours ?? null,
        approval_threshold: c.approval_threshold ?? null,
        pricing_rules: c.pricing_rules,
        is_active: c.is_active ?? null,
        start_date: c.start_date ?? null,
        end_date: c.end_date ?? null,
      })) ?? [],
    locations:
      (locationsRes.data as FleetLocationOptionRow[] | null)?.map((l) => ({
        id: String(l.id),
        fleet_client_id: l.fleet_client_id ?? null,
        name: l.name ?? null,
        address: l.address ?? null,
        city: l.city ?? null,
        state: l.state ?? null,
        service_window_start: l.service_window_start ?? null,
        service_window_end: l.service_window_end ?? null,
      })) ?? [],
    purchaseOrders:
      (posRes.data as FleetPurchaseOrderOptionRow[] | null)?.map((p) => ({
        id: String(p.id),
        fleet_client_id: p.fleet_client_id ?? null,
        po_number: p.po_number ?? null,
        amount_limit: p.amount_limit ?? null,
        amount_authorized: p.amount_authorized ?? null,
        amount_consumed: p.amount_consumed ?? null,
        amount_used: p.amount_used ?? null,
        status: p.status ?? null,
      })) ?? [],
    serviceProfiles:
      (serviceRulesRes.data as FleetServiceRuleOptionRow[] | null)?.map((rule) => ({
        id: String(rule.id),
        fleet_client_id: rule.fleet_client_id ?? null,
        service_class: rule.service_class,
        base_labor_package: rule.base_labor_package,
        interval_miles: rule.interval_miles,
        interval_months: rule.interval_months,
        base_price: rule.base_price,
        package_code: rule.package_code ?? null,
        package_label: rule.package_label ?? null,
        estimated_duration_minutes: rule.estimated_duration_minutes ?? null,
        includes: Array.isArray(rule.includes) ? (rule.includes as string[]) : [],
      })) ?? [],
    contractServices:
      ((contractServicesRes.data as Array<{
        id: string;
        fleet_contract_id: string;
        service_catalog_id: string | null;
        custom_price: number | null;
        custom_label: string | null;
        is_active: boolean;
        service_catalog: { name: string | null; default_price: number | null } | null;
      }> | null) ?? []).map((r) => ({
        id: String(r.id),
        fleet_contract_id: String(r.fleet_contract_id),
        service_catalog_id: r.service_catalog_id ?? null,
        custom_price: r.custom_price ?? null,
        custom_label: r.custom_label ?? null,
        is_active: r.is_active !== false,
        catalog_name: r.service_catalog?.name ?? null,
        catalog_default_price: r.service_catalog?.default_price ?? null,
      })),
  };
}

export async function fetchFleetVehicleEligibility(
  fleetClientId: string,
): Promise<FleetVehicleEligibility[]> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("fleet_service_schedules")
    .select("fleet_vehicle_id, service_class, status, due_date, due_mileage, base_labor_package, estimated_price, rule_id")
    .eq("user_id", user.id)
    .eq("fleet_client_id", fleetClientId);

  if (error) throw error;
  return (data ?? []) as FleetVehicleEligibility[];
}

export async function fetchFleetWorkOrderDetail(
  workOrderId: string,
): Promise<FleetWorkOrderDetailResult> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) {
    throw new Error("You must be logged in to view fleet work orders.");
  }

  const [orderRes, lineItemsRes, logsRes, approvalsRes] = await Promise.all([
    supabase
      .from("fleet_work_orders")
      .select(
        "*, fleet_vehicles(id, year, make, model, unit_number, vin, mileage, license_plate), fleet_clients(id, company_name), fleet_contracts(id, name, sla_hours, approval_threshold, pricing_rules), fleet_locations(id, name, address, city, state), technicians!fleet_work_orders_assigned_technician_id_fkey(id, name, status, last_location_update)"
      )
      .eq("id", workOrderId)
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("fleet_work_order_line_items")
      .select("*")
      .eq("fleet_work_order_id", workOrderId)
      .eq("user_id", user.id)
      .order("sort_order"),
    supabase
      .from("fleet_activity_logs")
      .select("*")
      .eq("fleet_work_order_id", workOrderId)
      .order("created_at", { ascending: false }),
    supabase
      .from("fleet_approvals")
      .select("*")
      .eq("fleet_work_order_id", workOrderId)
      .order("created_at", { ascending: false }),
  ]);

  return {
    order: (orderRes.data as FleetWorkOrderDetail | null) ?? null,
    lineItems: (lineItemsRes.data as FleetWorkOrderLineItem[] | null) ?? [],
    activityLogs: (logsRes.data as FleetActivityLog[] | null) ?? [],
    approvals: (approvalsRes.data as FleetApproval[] | null) ?? [],
  };
}

export async function fetchAssignableTechnicians() {
  const { data, error } = await supabase
    .from("technicians")
    .select("id,name")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function fetchFleetDomainSeparationHealth(userId: string): Promise<FleetDomainSeparationHealth> {
  const schedulerStatuses = ["scheduled", "assigned", "in_progress"];

  const [visibleRes, missingScheduleRes, legacyAppointmentsRes] = await Promise.all([
    supabase
      .from("fleet_work_orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", schedulerStatuses)
      .not("scheduled_date", "is", null),
    supabase
      .from("fleet_work_orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", schedulerStatuses)
      .is("scheduled_date", null),
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("source", "fleet_work_order"),
  ]);

  return {
    fleetSchedulerVisibleCount: visibleRes.count ?? 0,
    fleetMissingScheduleCount: missingScheduleRes.count ?? 0,
    legacyFleetAppointmentCount: legacyAppointmentsRes.count ?? 0,
  };
}

// ── Ops feed ────────────────────────────────────────────────────────────────

export interface FleetOpsEvent {
  id: string;
  fleet_client_id: string;
  fleet_vehicle_id: string | null;
  fleet_work_order_id: string | null;
  fleet_purchase_order_id: string | null;
  event_category: "status" | "dispatch" | "assignment" | "finance" | "edit" | "create" | "delete";
  event_type: string;
  actor_role: string;
  summary: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface FetchFleetOpsEventsParams {
  fleetClientId?: string;
  vehicleId?: string;
  workOrderId?: string;
  limit?: number;
}

export async function fetchFleetOpsEvents(params: FetchFleetOpsEventsParams): Promise<FleetOpsEvent[]> {
  let q = supabase
    .from("fleet_ops_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(params.limit ?? 50);
  if (params.fleetClientId) q = q.eq("fleet_client_id", params.fleetClientId);
  if (params.vehicleId) q = q.eq("fleet_vehicle_id", params.vehicleId);
  if (params.workOrderId) q = q.eq("fleet_work_order_id", params.workOrderId);
  const { data } = await q;
  return (data ?? []) as unknown as FleetOpsEvent[];
}

/** Subscribe to INSERTs on fleet_ops_events. Consumer filters by scope. */
export function subscribeFleetOpsEvents(
  scopeKey: string,
  onInsert: (row: FleetOpsEvent) => void,
): { unsubscribe: () => void } {
  const channel = supabase
    .channel(`fleet-ops-${scopeKey}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "fleet_ops_events" },
      (payload) => onInsert(payload.new as unknown as FleetOpsEvent),
    )
    .subscribe();
  return {
    unsubscribe: () => {
      supabase.removeChannel(channel);
    },
  };
}

import { apiClient } from "@/lib/api-client";
import type { Database } from "@/integrations/supabase/types";
import { getOfflineDatabase } from "@/offline/database";
import { isOfflineEligibleForCurrentUser } from "@/offline/rollout";
import { safeParseDate } from "@/lib/datetime";

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
}/** Fetch fleet dashboard data: KPIs, recent orders, scheduled orders. */
export async function fetchFleetDashboardData(userId: string): Promise<FleetDashboardData> {
  const { data } = await apiClient.get<{ data: FleetDashboardData }>("/v1/fleet/dashboard");
  return data as FleetDashboardData;
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
      created_at: safeParseDate(row._raw.updated_at_local)?.toISOString() ?? new Date(0).toISOString(),
      updated_at: safeParseDate(row._raw.updated_at_local)?.toISOString() ?? new Date(0).toISOString(),
      fleet_vehicles: null,
      fleet_clients: null,
    }) as unknown as FleetWorkOrderSummary)
    .filter((row) => Boolean(row.id && row.status && row.id !== ''))
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
}/**
 * List all fleet work orders for the current user.
 */
export async function fetchFleetWorkOrders(
  userId: string
): Promise<FleetWorkOrderSummary[]> {
  try {
    const { data } = await apiClient.get<{ data: FleetWorkOrderSummary[] }>("/v1/fleet/work-orders");
    return data ?? [];
  } catch (error) {
    console.error("[fetchFleetWorkOrders] Error:", error);
    if (await isOfflineEligibleForCurrentUser()) {
      return fetchFleetWorkOrdersFromOffline();
    }
    return [];
  }
}


export interface FleetWorkOrderPageResult {
  rows: FleetWorkOrderSummary[];
  total: number;
  counts: Record<string, number>;
  aggregates: { open: number; active: number; priority: number };
}export async function fetchFleetWorkOrdersPage(input: { userId: string; page: number; pageSize: number; search?: string; status?: string; clientId?: string; sort?: string }): Promise<FleetWorkOrderPageResult> {
  const { data } = await apiClient.get<{ data: FleetWorkOrderPageResult }>("/v1/fleet/work-orders/page", {
    query: {
      page: input.page,
      page_size: input.pageSize,
      search: input.search,
      status: input.status,
      client_id: input.clientId,
      sort: input.sort,
    },
  });
  return data as FleetWorkOrderPageResult;
}


export interface FleetSchedulerWindow {
  scheduled: FleetWorkOrderSummary[];
  unscheduled: FleetWorkOrderSummary[];
  counts: { scheduled: number; unscheduled: number; exceptions: number };
}
/** Date-windowed scheduler payload plus a bounded, separate unscheduled queue. */
export async function fetchFleetSchedulerWindow(userId: string, startDate: string, endDate: string): Promise<FleetSchedulerWindow> {
  const { data } = await apiClient.get<{ data: FleetSchedulerWindow }>("/v1/fleet/scheduler-window", {
    query: { start_date: startDate, end_date: endDate },
  });
  return data as FleetSchedulerWindow;
}
/** Invalidates only the scheduler window when a work-order row changes. */
export function subscribeToFleetScheduler(userId: string, onInvalidate: () => void): () => void {
  // Realtime subscriptions are no longer wired to direct Supabase access.
  // Poll the query instead; the returned function unsubscribes (no-op).
  return () => {};
}
export function subscribeToFleetList(userId: string, table: "fleet_work_orders" | "fleet_vehicles", onInvalidate: () => void): () => void {
  // Realtime subscriptions are no longer wired to direct Supabase access.
  // Poll the query instead; the returned function unsubscribes (no-op).
  return () => {};
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

  const { data } = await apiClient.get<{
    data: { vans: FleetVanSummary[]; technicians: FleetTechnicianSummary[] };
  }>("/v1/fleet/vans-overview");
  return { vans: data?.vans ?? [], technicians: data?.technicians ?? [] };
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

  try {
    const { data } = await apiClient.get<{ data: FleetClientSummary[] }>("/v1/fleet/clients");
    return data ?? [];
  } catch (error) {
    console.error("[fetchFleetClients] Error fetching fleet clients", error);
    return [];
  }
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

  try {
    const { data } = await apiClient.get<{ data: FleetVehicleListItem[] }>("/v1/fleet/vehicles-list");
    return data ?? [];
  } catch (error) {
    console.error("[fetchFleetVehiclesList] Error fetching fleet vehicles", error);
    return [];
  }
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
}/** Server-filtered vehicle list with exact counts; no full fleet download. */
export async function fetchFleetVehiclesPage(options: FleetVehiclePageOptions): Promise<FleetVehiclePageResult> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("You must be logged in to view fleet vehicles.");
  const { data } = await apiClient.get<{ data: FleetVehiclePageResult }>("/v1/fleet/vehicles/page", {
    query: {
      page: options.page,
      page_size: options.pageSize,
      search: options.search,
      client_id: options.clientId,
      status: options.status,
      location_id: options.locationId,
      contract_id: options.contractId,
      data_filter: options.dataFilter,
      sort: options.sort,
    },
  });
  return data as FleetVehiclePageResult;
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
type FleetServiceRuleBasicRow = Pick<Database["public"]["Tables"]["fleet_service_rules"]["Row"], "id" | "service_class" | "fleet_client_id">;/**
 * Options for the fleet vehicle creation form (clients, locations, contracts).
 */
export async function fetchFleetVehicleFormOptions(): Promise<FleetVehicleFormOptions> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) {
    throw new Error("You must be logged in to manage fleet vehicles.");
  }

  const { data } = await apiClient.get<{ data: FleetVehicleFormOptions }>("/v1/fleet/vehicle-form-options");
  return data as FleetVehicleFormOptions;
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
}export async function fetchFleetLocations(): Promise<FleetLocationSummary[]> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) throw new Error("Not authenticated");

  const { data } = await apiClient.get<{ data: FleetLocationSummary[] }>("/v1/fleet/locations");
  return data ?? [];
}
export async function fetchFleetPurchaseOrders(): Promise<FleetPurchaseOrderSummary[]> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) throw new Error("Not authenticated");

  const { data } = await apiClient.get<{ data: FleetPurchaseOrderSummary[] }>("/v1/fleet/purchase-orders");
  return data ?? [];
}
export async function fetchFleetContacts(): Promise<FleetContactSummary[]> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) throw new Error("Not authenticated");

  const { data } = await apiClient.get<{ data: FleetContactSummary[] }>("/v1/fleet/contacts");
  return data ?? [];
}
export async function fetchFleetContracts(): Promise<FleetContractSummary[]> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) throw new Error("Not authenticated");

  const { data } = await apiClient.get<{ data: FleetContractSummary[] }>("/v1/fleet/contracts");
  return ((data ?? []) as FleetContractSummary[]).sort((a, b) =>
    String(a.name ?? "").localeCompare(String(b.name ?? ""))
  );
}
export async function fetchFleetInvoices(): Promise<FleetInvoiceSummary[]> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) throw new Error("Not authenticated");

  const { data } = await apiClient.get<{ data: FleetInvoiceSummary[] }>("/v1/fleet/work-order-invoices");
  return data ?? [];
}
export async function fetchFleetReportsOverview(): Promise<FleetReportsOverviewResult> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) throw new Error("Not authenticated");

  const { data } = await apiClient.get<{ data: FleetReportsOverviewResult }>("/v1/fleet/reports-overview");
  return data as FleetReportsOverviewResult;
}
export async function fetchFleetTodayWorkOrdersWithCheckins(): Promise<FleetTodayWorkOrdersResult> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) throw new Error("Not authenticated");

  const { data } = await apiClient.get<{ data: FleetTodayWorkOrdersResult }>("/v1/fleet/today-work-orders");
  return data as FleetTodayWorkOrdersResult;
}
export async function fetchFleetWorkOrderCreateOptions(): Promise<FleetWorkOrderCreateOptions> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) {
    throw new Error("You must be logged in to create fleet work orders.");
  }

  const { data } = await apiClient.get<{ data: FleetWorkOrderCreateOptions }>(
    "/v1/fleet/work-order-create-options"
  );
  return data as FleetWorkOrderCreateOptions;
}
export async function fetchFleetVehicleEligibility(
  fleetClientId: string,
): Promise<FleetVehicleEligibility[]> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return [];

  const { data } = await apiClient.get<{ data: FleetVehicleEligibility[] }>("/v1/fleet/vehicle-eligibility", {
    query: { fleet_client_id: fleetClientId },
  });
  return data ?? [];
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

  const { data } = await apiClient.get<{ data: FleetWorkOrderDetailResult }>(
    `/v1/fleet/work-orders/${workOrderId}/detail`
  );
  return data as FleetWorkOrderDetailResult;
}
export async function fetchAssignableTechnicians() {
  const { data } = await apiClient.get<{ data: Array<{ id: string; name: string }> }>(
    "/v1/fleet/assignable-technicians"
  );
  return data ?? [];
}
export async function fetchFleetDomainSeparationHealth(userId: string): Promise<FleetDomainSeparationHealth> {
  const { data } = await apiClient.get<{ data: FleetDomainSeparationHealth }>(
    "/v1/fleet/domain-separation-health"
  );
  return data as FleetDomainSeparationHealth;
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
}export async function fetchFleetOpsEvents(params: FetchFleetOpsEventsParams): Promise<FleetOpsEvent[]> {
  const { data } = await apiClient.get<{ data: FleetOpsEvent[] }>("/v1/fleet/ops-events", {
    query: {
      fleet_client_id: params.fleetClientId,
      vehicle_id: params.vehicleId,
      work_order_id: params.workOrderId,
      limit: params.limit,
    },
  });
  return data ?? [];
}
/** Subscribe to INSERTs on fleet_ops_events. Consumer filters by scope. */
export function subscribeFleetOpsEvents(
  scopeKey: string,
  onInsert: (row: FleetOpsEvent) => void,
): { unsubscribe: () => void } {
  // Realtime subscriptions are no longer wired to direct Supabase access.
  // Poll the query instead; the returned function unsubscribes (no-op).
  return {
    unsubscribe: () => {},
  };
}


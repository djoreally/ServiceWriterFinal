import { productionSupabase, supabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import { buildCommandCenterBuckets } from "@/lib/command-center-filters";
import { format } from "date-fns";

export type OperationalJobSource = "appointment" | "work_order";

export interface OperationalJobRow {
  job_id: string;
  user_id: string;
  title: string;
  scheduled_date: string;
  scheduled_time: string;
  status: string | null;
  dispatch_status: string | null;
  canonical_state: string;
  job_priority: string | null;
  estimated_duration_minutes: number | null;
  duration_minutes: number | null;
  assigned_technician_id: string | null;
  assigned_technician_name: string | null;
  assigned_van_id: string | null;
  assigned_van_name: string | null;
  assigned_at: string | null;
  dispatch_notes: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  location_address: string | null;
  location_lat: number | null;
  location_lng: number | null;
  estimated_cost: number | null;
  source: OperationalJobSource;
  fleet_job_id?: string | null;
  fleet_job_number?: string | null;
  fleet_job_vehicle_count?: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  service_catalog_name: string | null;
  last_event_at: string | null;
  source_freshness_ms: number | null;
}

interface OperationalAddressSource {
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
}

interface OperationalCustomerSource extends OperationalAddressSource {
  first_name: string;
  last_name: string;
  company_name: string | null;
  phone: string | null;
}

interface OperationalLocationSource extends OperationalAddressSource {
  latitude: number | null;
  longitude: number | null;
}

interface OperationalVehicleSource {
  year: number | null;
  make: string | null;
  model: string | null;
}

interface AppointmentJobSource {
  id: string;
  status: string;
  starts_at: string;
  ends_at: string;
  assigned_user_id: string | null;
  updated_at: string;
  metadata: unknown;
  customers: OperationalCustomerSource | null;
  vehicles: OperationalVehicleSource | null;
  locations: OperationalLocationSource | null;
}

interface WorkOrderJobSource {
  id: string;
  number: number;
  status: string;
  priority: string;
  opened_at: string | null;
  created_at: string;
  updated_at: string;
  technician_notes: string | null;
  metadata: unknown;
  customers: OperationalCustomerSource | null;
  vehicles: OperationalVehicleSource | null;
  locations: OperationalLocationSource | null;
  work_order_assignments: Array<{ user_id: string; assigned_at: string; unassigned_at: string | null }>;
}

type DispatchOperationalViewRow = Omit<Partial<OperationalJobRow>, "source"> & {
  id?: string;
  source?: string;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function normalizeDispatchViewRow(row: DispatchOperationalViewRow): OperationalJobRow {
  const source = row.source === "work_order" || row.source === "fleet_work_order" ? "work_order" : "appointment";
  return {
    job_id: String(row.job_id ?? row.id ?? ""),
    user_id: String(row.user_id ?? ""),
    title: String(row.title ?? "Service Appointment"),
    scheduled_date: String(row.scheduled_date ?? ""),
    scheduled_time: String(row.scheduled_time ?? "00:00:00"),
    status: row.status ?? null,
    dispatch_status: row.dispatch_status ?? null,
    canonical_state: String(row.canonical_state ?? row.status ?? "queued"),
    job_priority: row.job_priority ?? null,
    estimated_duration_minutes: row.estimated_duration_minutes == null ? null : Number(row.estimated_duration_minutes),
    duration_minutes: row.duration_minutes == null ? null : Number(row.duration_minutes),
    assigned_technician_id: row.assigned_technician_id ?? null,
    assigned_technician_name: row.assigned_technician_name ?? null,
    assigned_van_id: row.assigned_van_id ?? null,
    assigned_van_name: row.assigned_van_name ?? null,
    assigned_at: row.assigned_at ?? null,
    dispatch_notes: row.dispatch_notes ?? null,
    guest_name: row.guest_name ?? null,
    guest_phone: row.guest_phone ?? null,
    location_address: row.location_address ?? null,
    location_lat: row.location_lat == null ? null : Number(row.location_lat),
    location_lng: row.location_lng == null ? null : Number(row.location_lng),
    estimated_cost: row.estimated_cost == null ? null : Number(row.estimated_cost),
    source,
    fleet_job_id: row.fleet_job_id ?? null,
    fleet_job_number: row.fleet_job_number ?? null,
    fleet_job_vehicle_count: row.fleet_job_vehicle_count == null ? null : Number(row.fleet_job_vehicle_count),
    customer_name: row.customer_name ?? null,
    customer_phone: row.customer_phone ?? null,
    vehicle_year: row.vehicle_year == null ? null : Number(row.vehicle_year),
    vehicle_make: row.vehicle_make ?? null,
    vehicle_model: row.vehicle_model ?? null,
    service_catalog_name: row.service_catalog_name ?? null,
    last_event_at: row.last_event_at ?? null,
    source_freshness_ms: row.source_freshness_ms == null ? null : Number(row.source_freshness_ms),
  };
}

function customerName(customer: OperationalCustomerSource | null): string | null {
  if (!customer) return null;
  return [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim() || customer.company_name || null;
}

function address(row: OperationalAddressSource | null): string | null {
  if (!row) return null;
  return [row.address_line1, row.address_line2, row.city, row.region, row.postal_code].filter(Boolean).join(", ") || null;
}

function profileName(profiles: Map<string, string>, id: string | null | undefined): string | null {
  return id ? profiles.get(id) ?? null : null;
}

function appointmentJob(row: AppointmentJobSource, profileNames: Map<string, string>, workspaceId: string): OperationalJobRow {
  const meta = object(row.metadata);
  const start = new Date(row.starts_at);
  const end = new Date(row.ends_at);
  const minutes = Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000));
  const location = row.locations;
  const customer = row.customers;
  const vehicle = row.vehicles;
  const assigned = row.assigned_user_id ?? null;
  const dispatchStatus = String(meta.dispatch_status ?? (assigned ? "assigned" : "unassigned"));
  return {
    job_id: row.id,
    user_id: workspaceId,
    title: String(meta.title ?? meta.service_name ?? "Appointment"),
    scheduled_date: format(start, "yyyy-MM-dd"),
    scheduled_time: format(start, "HH:mm:ss"),
    status: row.status,
    dispatch_status: dispatchStatus,
    canonical_state: row.status,
    job_priority: optionalString(meta.job_priority),
    estimated_duration_minutes: minutes,
    duration_minutes: minutes,
    assigned_technician_id: assigned,
    assigned_technician_name: profileName(profileNames, assigned),
    assigned_van_id: null,
    assigned_van_name: null,
    assigned_at: optionalString(meta.assigned_at),
    dispatch_notes: optionalString(meta.dispatch_notes),
    guest_name: optionalString(meta.guest_name),
    guest_phone: optionalString(meta.guest_phone),
    location_address: address(location) ?? address(customer),
    location_lat: location?.latitude == null ? null : Number(location.latitude),
    location_lng: location?.longitude == null ? null : Number(location.longitude),
    estimated_cost: meta.estimated_cost == null ? null : Number(meta.estimated_cost),
    source: "appointment",
    customer_name: customerName(customer),
    customer_phone: customer?.phone ?? null,
    vehicle_year: vehicle?.year ?? null,
    vehicle_make: vehicle?.make ?? null,
    vehicle_model: vehicle?.model ?? null,
    service_catalog_name: optionalString(meta.service_name),
    last_event_at: row.updated_at ?? null,
    source_freshness_ms: row.updated_at ? Math.max(0, Date.now() - new Date(row.updated_at).getTime()) : null,
  };
}

function workOrderJob(row: WorkOrderJobSource, assignmentByOrder: Map<string, string>, profileNames: Map<string, string>, workspaceId: string): OperationalJobRow {
  const meta = object(row.metadata);
  const scheduledRaw = optionalString(meta.scheduled_at) ?? row.opened_at ?? row.created_at;
  const start = new Date(scheduledRaw);
  const assigned = assignmentByOrder.get(row.id) ?? null;
  const customer = row.customers;
  const vehicle = row.vehicles;
  const location = row.locations;
  return {
    job_id: row.id,
    user_id: workspaceId,
    title: String(meta.title ?? `Repair Order RO-${row.number}`),
    scheduled_date: format(start, "yyyy-MM-dd"),
    scheduled_time: format(start, "HH:mm:ss"),
    status: row.status,
    dispatch_status: assigned ? "assigned" : "unassigned",
    canonical_state: row.status,
    job_priority: row.priority ?? null,
    estimated_duration_minutes: meta.duration_minutes == null ? 60 : Number(meta.duration_minutes),
    duration_minutes: meta.duration_minutes == null ? 60 : Number(meta.duration_minutes),
    assigned_technician_id: assigned,
    assigned_technician_name: profileName(profileNames, assigned),
    assigned_van_id: null,
    assigned_van_name: null,
    assigned_at: optionalString(meta.assigned_at),
    dispatch_notes: optionalString(meta.dispatch_notes) ?? row.technician_notes,
    guest_name: null,
    guest_phone: null,
    location_address: address(location) ?? address(customer) ?? optionalString(meta.location_address),
    location_lat: location?.latitude == null ? (meta.location_lat == null ? null : Number(meta.location_lat)) : Number(location.latitude),
    location_lng: location?.longitude == null ? (meta.location_lng == null ? null : Number(meta.location_lng)) : Number(location.longitude),
    estimated_cost: meta.estimated_cost == null ? null : Number(meta.estimated_cost),
    source: "work_order",
    fleet_job_id: optionalString(meta.fleet_job_id),
    fleet_job_number: optionalString(meta.fleet_job_number),
    fleet_job_vehicle_count:
      (meta.fleet_vehicle_count == null ? null : Number(meta.fleet_vehicle_count)),
    customer_name: customerName(customer),
    customer_phone: customer?.phone ?? null,
    vehicle_year: vehicle?.year ?? null,
    vehicle_make: vehicle?.make ?? null,
    vehicle_model: vehicle?.model ?? null,
    service_catalog_name: null,
    last_event_at: row.updated_at ?? null,
    source_freshness_ms: row.updated_at ? Math.max(0, Date.now() - new Date(row.updated_at).getTime()) : null,
  };
}

async function fetchCanonicalJobs(
  fromDate: string,
  toDate: string,
): Promise<{ data: OperationalJobRow[]; error: unknown }> {
  const context = await resolveCurrentWorkspace();
  if (!context) return { data: [], error: null };
  const workspaceId = context.workspaceId;
  // The compatibility view is intentionally absent from the generated schema.
  // Prefer it when available because it is the canonical dispatch read model;
  // fall back to normalized production tables on older deployments.
  const compatibilityClient = supabase as any;
  const viewResult = await compatibilityClient.from("dispatch_operational_jobs_v1")
    .select("*")
    .eq("user_id", context.userId)
    .gte("scheduled_date", fromDate)
    .lte("scheduled_date", toDate)
    .order("scheduled_date");
  if (!viewResult.error && Array.isArray(viewResult.data)) {
    return {
      data: (viewResult.data as DispatchOperationalViewRow[]).map(normalizeDispatchViewRow),
      error: null,
    };
  }
  const startIso = new Date(`${fromDate}T00:00:00`).toISOString();
  const endIso = new Date(`${toDate}T23:59:59.999`).toISOString();

  const [appointmentsRes, workOrdersRes, membersRes] = await Promise.all([
    productionSupabase.from("appointments")
      .select("id,status,starts_at,ends_at,assigned_user_id,updated_at,metadata,customers(first_name,last_name,company_name,phone,address_line1,address_line2,city,region,postal_code),vehicles(year,make,model),locations(address_line1,address_line2,city,region,postal_code,latitude,longitude)")
      .eq("workspace_id", workspaceId)
      .gte("starts_at", startIso)
      .lte("starts_at", endIso)
      .order("starts_at"),
    productionSupabase.from("work_orders")
      .select("id,number,status,priority,opened_at,created_at,updated_at,technician_notes,metadata,customers(first_name,last_name,company_name,phone,address_line1,address_line2,city,region,postal_code),vehicles(year,make,model),locations(address_line1,address_line2,city,region,postal_code,latitude,longitude),work_order_assignments(user_id,assigned_at,unassigned_at)")
      .eq("workspace_id", workspaceId)
      .is("appointment_id", null)
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .order("created_at"),
    productionSupabase.from("workspace_members")
      .select("user_id,profiles!workspace_members_user_id_fkey(display_name)")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true),
  ]);

  const error = appointmentsRes.error ?? workOrdersRes.error ?? membersRes.error;
  if (error) return { data: [], error };

  const profileNames = new Map<string, string>();
  for (const member of membersRes.data ?? []) {
    const name = member.profiles?.display_name;
    if (name) profileNames.set(member.user_id, name);
  }

  const assignmentByOrder = new Map<string, string>();
  for (const row of workOrdersRes.data ?? []) {
    const active = (row.work_order_assignments ?? []).find((assignment) => !assignment.unassigned_at);
    if (active?.user_id) assignmentByOrder.set(row.id, active.user_id);
  }

  const jobs = [
    ...(appointmentsRes.data ?? []).map((row) => appointmentJob(row, profileNames, workspaceId)),
    ...(workOrdersRes.data ?? []).map((row) => workOrderJob(row, assignmentByOrder, profileNames, workspaceId)),
  ].sort((a, b) => `${a.scheduled_date}T${a.scheduled_time}`.localeCompare(`${b.scheduled_date}T${b.scheduled_time}`));

  return { data: jobs, error: null };
}

export async function fetchOperationalJobsByDate(_userId: string, dateStr: string) {
  return fetchCanonicalJobs(dateStr, dateStr);
}

export async function fetchOperationalJobsByDateRange(_userId: string, fromDate: string, toDate: string) {
  return fetchCanonicalJobs(fromDate, toDate);
}

export async function fetchAllUpcomingOperationalJobs(_userId: string) {
  const today = format(new Date(), "yyyy-MM-dd");
  const future = new Date();
  future.setDate(future.getDate() + 30);
  return fetchCanonicalJobs(today, format(future, "yyyy-MM-dd"));
}

/** Command Center and Dispatch are now the same operational surface. */
export async function fetchLifecycleSurfaceParity(userId: string, dateStr: string) {
  const { data, error } = await fetchOperationalJobsByDate(userId, dateStr);
  if (error) throw error;
  const jobs = (data ?? []).map((row) => ({ id: row.job_id, status: row.status, dispatch_status: row.dispatch_status }));
  const command = buildCommandCenterBuckets(jobs);
  return {
    command: { queue: command.queue.length, active: command.active.length, completed: command.completed.length, cancelled: command.cancelled.length },
    dispatch: { queue: command.queue.length, active: command.active.length, completed: command.completed.length, cancelled: command.cancelled.length },
    technician: { queue: command.queue.length, active: command.active.length, completed: command.completed.length, cancelled: command.cancelled.length },
    isAligned: true,
  };
}

/**
 * Operational Jobs Query — canonical workspace-scoped reads for the dispatch/command-center board.
 *
 * Phase 2: the raw appointment/work-order/member reads go through the typed
 * API client (`@/lib/api-client`) to the appointments Hono router. All row
 * mapping stays client-side. Exported signatures are unchanged.
 */
import { apiClient } from "@/lib/api-client";
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

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
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
  // Always read normalized workspace tables. The old compatibility view is
  // keyed by a legacy user ID and can return a different dataset than the
  // workspace-scoped appointment list.
  try {
    const response = await apiClient.get<{
      data: {
        appointments: AppointmentJobSource[];
        work_orders: WorkOrderJobSource[];
        members: Array<{ user_id: string; profiles: { display_name: string } | Array<{ display_name: string }> | null }>;
      } | null;
    }>("/v1/dispatch/operational-jobs", {
      query: { from: fromDate, to: toDate, selected_workspace_id: workspaceId },
    });

    const payload = response.data;
    if (!payload) return { data: [], error: null };

    const profileNames = new Map<string, string>();
    for (const member of payload.members ?? []) {
      const profiles = member.profiles;
      const name = Array.isArray(profiles) ? profiles[0]?.display_name : profiles?.display_name;
      if (name) profileNames.set(member.user_id, name);
    }

    const assignmentByOrder = new Map<string, string>();
    for (const row of payload.work_orders ?? []) {
      const active = (row.work_order_assignments ?? []).find((assignment) => !assignment.unassigned_at);
      if (active?.user_id) assignmentByOrder.set(row.id, active.user_id);
    }

    const jobs = [
      ...(payload.appointments ?? []).map((row) => appointmentJob(row, profileNames, workspaceId)),
      ...(payload.work_orders ?? []).map((row) => workOrderJob(row, assignmentByOrder, profileNames, workspaceId)),
    ].sort((a, b) => `${a.scheduled_date}T${a.scheduled_time}`.localeCompare(`${b.scheduled_date}T${b.scheduled_time}`));

    return { data: jobs, error: null };
  } catch (error) {
    return { data: [], error };
  }
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

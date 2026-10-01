import { addDays, format } from "date-fns";
import { apiClient } from "@/lib/api-client";
import { matchesTechLifecycleFilter } from "@/lib/tech-job-state";
import { buildCommandCenterBuckets } from "@/lib/command-center-filters";
import { fetchOperationalJobsByDateRange, type OperationalJobRow } from "@/application/queries/operational-jobs.query";
import { normalizeTechNotificationPreferences } from "@/lib/technician-notification-preferences";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface TechIdentityLike {
  isAdmin: boolean;
  userId: string;
  techId: string;
  businessUserId?: string;
}

export interface TechnicianAppContext {
  user_id: string;
  workspace_user_id: string;
  technician_id: string | null;
  technician_name: string;
  role: string;
  is_admin_preview: boolean;
  access_state: "linked" | "locked" | "deactivated" | "unlinked" | "admin_preview" | "unauthenticated" | "invited" | "roster_only";
  presence_state: string;
  field_status: string | null;
  shift_id: string | null;
  shift_status: string | null;
  clock_in: string | null;
  van_id: string | null;
  van_name: string | null;
  push_notifications_enabled: boolean;
  data_fresh_at: string;
}

export async function fetchTechnicianAppContext(): Promise<TechnicianAppContext> {
  const response = await apiClient.post<{ data: TechnicianAppContext }>("/v1/tech-app/context", {});
  return response.data;
}

export async function fetchTechnicianJobWorkspace(jobId: string): Promise<Record<string, unknown>> {
  const response = await apiClient.post<{ data: Record<string, unknown> | null }>("/v1/tech-app/job-workspace", {
    job_id: jobId,
  });
  return (response.data ?? {}) as Record<string, unknown>;
}

/** Phase 1 — Mission Control: canonical technician session (shift + mission board). */
export interface TechSessionJob {
  id: string;
  job_source: "appointment" | "fleet_work_order";
  is_fleet: boolean;
  title: string;
  scheduled_date: string;
  scheduled_time: string;
  estimated_duration_minutes: number;
  status: string;
  dispatch_status: string;
  stage: string;
  job_priority: string;
  customer_name: string | null;
  customer_phone: string | null;
  location_address: string | null;
  location_lat: number | null;
  location_lng: number | null;
  notes: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  service_name: string | null;
  updated_at: string | null;
  fleet_job_id?: string | null;
  fleet_job_number?: string | null;
  fleet_vehicle_count?: number | null;
}

export interface TechSession {
  access_state: string;
  workspace_user_id: string | null;
  technician_id: string | null;
  shift: { shift_id: string; clock_in: string; break_start: string | null; break_end: string | null; status: string } | null;
  is_on_shift: boolean;
  is_on_break: boolean;
  jobs: TechSessionJob[];
  current_job: TechSessionJob | null;
  next_job: TechSessionJob | null;
  data_fresh_at: string;
}

export async function fetchTechnicianSession(): Promise<TechSession> {
  const response = await apiClient.post<{ data: TechSession | null }>("/v1/tech-app/session", {});
  const session = (response.data ?? {}) as unknown as TechSession;
  return { ...session, jobs: (session?.jobs ?? []) as TechSessionJob[] };
}

/** Phase 2 — Unified Workspace: one job view for retail appointments and fleet work orders. */
export interface JobExecutionStep {
  id: string;
  step_key: string;
  step_name: string;
  step_order: number;
  is_required: boolean;
  requires_photo: boolean;
  status: "pending" | "in_progress" | "completed" | "blocked";
  evidence_url: string | null;
  notes: string | null;
  completed_at: string | null;
}

export interface TechJobWorkspace {
  job: Record<string, unknown> & {
    id: string;
    job_source: "appointment" | "fleet_work_order";
    is_fleet: boolean;
    title: string;
    status: string;
    dispatch_status: string;
    stage: string;
    customer: { id: string | null; name: string | null; phone: string | null; email: string | null };
    vehicle: { id: string | null; year: number | null; make: string | null; model: string | null; vin: string | null; license_plate: string | null };
    site: { address: string | null; lat: number | null; lng: number | null };
  };
  source: "appointment" | "fleet_work_order";
  checklist: JobExecutionStep[];
  parts: Array<{ id: string; description: string | null; quantity: number | null; part_number: string | null }>;
  thread_id: string | null;
  data_fresh_at: string;
}

export async function fetchTechnicianJobWorkspaceV2(jobId: string): Promise<TechJobWorkspace> {
  const response = await apiClient.post<{ data: TechJobWorkspace | null }>("/v1/tech-app/job-workspace-v2", {
    job_id: jobId,
  });
  const workspace = (response.data ?? {}) as unknown as TechJobWorkspace;
  return { ...workspace, checklist: workspace?.checklist ?? [], parts: workspace?.parts ?? [] };
}

export type TechJobsFilter = "today" | "upcoming" | "in_progress" | "completed" | "issues";

interface TechOperationalJob {
  id: string;
  source: "appointment" | "fleet_work_order";
  title: string;
  scheduled_date: string;
  scheduled_time: string;
  estimated_duration_minutes: number | null;
  dispatch_status: string;
  status: string;
  job_priority: string;
  location_address: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  notes?: string | null;
  payment_status?: string | null;
  customers: { name: string; phone: string | null } | null;
  vehicles: { year: number; make: string; model: string; color?: string | null } | null;
  service_catalog: { name: string } | null;
  is_fleet?: boolean;
  fleet_job_id?: string | null;
  fleet_job_number?: string | null;
  fleet_vehicle_count?: number | null;
}

interface FleetAssignmentRow {
  id: string;
  order_number: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  status: string | null;
  priority: string | null;
  service_type: string | null;
  description: string | null;
  total: number | null;
  fleet_job_id: string | null;
  fleet_jobs: { job_number: string | null } | null;
  fleet_clients: { company_name: string | null } | null;
  fleet_locations: { name: string | null; address: string | null } | null;
  fleet_vehicles: {
    year: number | null;
    make: string | null;
    model: string | null;
    unit_number: string | null;
    license_plate: string | null;
  } | null;
}

export async function getCurrentAuthUserId(): Promise<string | null> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  return user?.id ?? null;
}

export async function fetchTechnicianIdByAuthUserId(_authUserId: string): Promise<string | null> {
  const response = await apiClient.get<{ data: string | null }>("/v1/tech-app/technician-id");
  return response.data ?? null;
}

export async function fetchTechMoreDataForCurrentUser() {
  const authUserId = await getCurrentAuthUserId();
  if (!authUserId) {
    return { tech: null, clockEntry: null };
  }

  const response = await apiClient.get<{
    data: { tech: Record<string, unknown> | null; clockEntry: Record<string, unknown> | null };
  }>("/v1/tech-app/more-data");

  return {
    tech: response.data.tech ?? null,
    clockEntry: response.data.clockEntry ?? null,
  };
}

export async function fetchTechJobsByFilter(identity: TechIdentityLike, filter: TechJobsFilter) {
  const today = format(new Date(), "yyyy-MM-dd");
  const nextWeek = format(addDays(new Date(), 7), "yyyy-MM-dd");
  const scopeUserId = identity.businessUserId || identity.userId;
  const { data, error } = await fetchOperationalJobsByDateRange(scopeUserId, today, nextWeek);
  if (error) throw error;

  const allJobs = ((data ?? []) as OperationalJobRow[])
    .filter((job) => identity.isAdmin || job.assigned_technician_id === identity.techId)
    .map(mapOperationalRowToTechJob)
    .filter((job: TechOperationalJob) => matchesTechLifecycleFilter(job, filter, today, nextWeek))
    .sort((a: TechOperationalJob, b: TechOperationalJob) => `${a.scheduled_date} ${a.scheduled_time}`.localeCompare(`${b.scheduled_date} ${b.scheduled_time}`));

  return allJobs as unknown as Array<Record<string, unknown>>;
}

export async function fetchTechTodayData(identity: TechIdentityLike) {
  const today = format(new Date(), "yyyy-MM-dd");
  const nextWeek = format(addDays(new Date(), 7), "yyyy-MM-dd");
  const scopeUserId = identity.businessUserId || identity.userId;

  const [{ data, error }, clockResult] = await Promise.all([
    fetchOperationalJobsByDateRange(scopeUserId, today, nextWeek),
    apiClient.get<{ data: Array<Record<string, unknown>> }>("/v1/tech-app/clock-entries", {
      query: { user_id: identity.userId, from: `${today}T00:00:00` },
    }),
  ]);
  if (error) throw error;

  const allJobs = ((data ?? []) as OperationalJobRow[])
    .filter((job) => identity.isAdmin || job.assigned_technician_id === identity.techId)
    .map(mapOperationalRowToTechJob)
    .sort((a: TechOperationalJob, b: TechOperationalJob) =>
      `${a.scheduled_date} ${a.scheduled_time}`.localeCompare(`${b.scheduled_date} ${b.scheduled_time}`)
    );

  return {
    jobs: allJobs as unknown as Array<Record<string, unknown>>,
    clockEntries: (clockResult.data ?? []) as Array<Record<string, unknown>>,
  };
}

export async function fetchTechDispatchParityByDate(identity: TechIdentityLike, dateStr: string) {
  const scopeUserId = identity.businessUserId || identity.userId;
  const { data, error } = await fetchOperationalJobsByDateRange(scopeUserId, dateStr, dateStr);
  if (error) throw error;

  const scoped = ((data ?? []) as OperationalJobRow[])
    .filter((job) => identity.isAdmin || job.assigned_technician_id === identity.techId)
    .map(mapOperationalRowToTechJob);

  const commandCenterBuckets = buildCommandCenterBuckets(
    scoped.map((job) => ({ id: job.id, status: job.status, dispatch_status: job.dispatch_status })),
  );

  const techCounts = {
    today: scoped.filter((job) => matchesTechLifecycleFilter(job, "today", dateStr, dateStr)).length,
    active: scoped.filter((job) => matchesTechLifecycleFilter(job, "in_progress", dateStr, dateStr)).length,
    completed: scoped.filter((job) => matchesTechLifecycleFilter(job, "completed", dateStr, dateStr)).length,
    issues: scoped.filter((job) => matchesTechLifecycleFilter(job, "issues", dateStr, dateStr)).length,
  };

  return {
    date: dateStr,
    techCounts,
    commandCenterCounts: {
      queue: commandCenterBuckets.queue.length,
      active: commandCenterBuckets.active.length,
      completed: commandCenterBuckets.completed.length,
    },
    deltas: {
      activeMinusActive: techCounts.active - commandCenterBuckets.active.length,
      completedMinusCompleted: techCounts.completed - commandCenterBuckets.completed.length,
    },
  };
}

export function mapOperationalRowToTechJob(job: OperationalJobRow): TechOperationalJob {
  const isFleet = job.source === "work_order";
  return {
    id: job.job_id,
    source: isFleet ? "fleet_work_order" : "appointment",
    title: job.title || (isFleet ? "Fleet Service" : "Service Appointment"),
    scheduled_date: job.scheduled_date,
    scheduled_time: job.scheduled_time,
    estimated_duration_minutes: job.estimated_duration_minutes ?? job.duration_minutes,
    dispatch_status: job.dispatch_status ?? "unassigned",
    status: job.status ?? "scheduled",
    job_priority: job.job_priority ?? "normal",
    location_address: job.location_address,
    location_lat: job.location_lat,
    location_lng: job.location_lng,
    notes: job.dispatch_notes ?? null,
    customers: (job.customer_name || job.guest_name)
      ? { name: job.customer_name ?? job.guest_name ?? "Customer", phone: job.customer_phone ?? job.guest_phone ?? null }
      : null,
    vehicles: (job.vehicle_year || job.vehicle_make || job.vehicle_model)
      ? {
          year: job.vehicle_year ?? 0,
          make: job.vehicle_make ?? "",
          model: job.vehicle_model ?? "",
        }
      : null,
    service_catalog: job.service_catalog_name ? { name: job.service_catalog_name } : null,
    is_fleet: isFleet,
    fleet_job_id: job.fleet_job_id ?? null,
    fleet_job_number: job.fleet_job_number ?? null,
    fleet_vehicle_count: job.fleet_job_vehicle_count ?? null,
  };
}

export async function fetchTechInventoryDataForCurrentUser() {
  const authUserId = await getCurrentAuthUserId();
  if (!authUserId) {
    return { vanId: null, vanName: "", items: [] as Array<Record<string, unknown>> };
  }

  const response = await apiClient.get<{
    data: { vanId: string | null; vanName: string; items: Array<Record<string, unknown>> };
  }>("/v1/tech-app/inventory");

  return {
    vanId: response.data.vanId,
    vanName: response.data.vanName,
    items: response.data.items ?? [],
  };
}

export async function fetchTechProfileDataForCurrentUser() {
  const authUserId = await getCurrentAuthUserId();
  if (!authUserId) {
    return { tech: null, skills: [] as Array<Record<string, unknown>> };
  }

  const response = await apiClient.get<{
    data: { tech: Record<string, unknown> | null; skills: Array<Record<string, unknown>> };
  }>("/v1/tech-app/profile");

  return {
    tech: response.data.tech ?? null,
    skills: response.data.skills ?? [],
  };
}

export async function fetchTechNotificationSettingsForCurrentUser() {
  const authUserId = await getCurrentAuthUserId();
  if (!authUserId) {
    return normalizeTechNotificationPreferences(null);
  }

  const response = await apiClient.get<{
    data: {
      push_notifications_enabled?: boolean | null;
      dispatch_push_enabled?: boolean | null;
      customer_sms_enabled?: boolean | null;
      customer_email_enabled?: boolean | null;
      offline_cache_enabled?: boolean | null;
    } | null;
  }>("/v1/tech-app/notification-settings");
  const data = response.data;

  return normalizeTechNotificationPreferences({
    pushNotificationsEnabled: data?.push_notifications_enabled,
    dispatchPushEnabled: data?.dispatch_push_enabled,
    customerSmsEnabled: data?.customer_sms_enabled,
    customerEmailEnabled: data?.customer_email_enabled,
    offlineCacheEnabled: data?.offline_cache_enabled,
  });
}

export async function fetchTechRouteStopsForCurrentUserToday(identity: TechIdentityLike) {
  const today = format(new Date(), "yyyy-MM-dd");
  const { data, error } = await fetchOperationalJobsByDateRange(identity.businessUserId || identity.userId, today, today);
  if (error) throw error;
  return ((data ?? []) as OperationalJobRow[])
    .filter((job) => (identity.isAdmin || job.assigned_technician_id === identity.techId)
      && job.status !== "cancelled" && job.dispatch_status !== "cancelled")
    .map(mapOperationalRowToTechJob) as unknown as Array<Record<string, unknown>>;
}

export async function fetchTechMessagesDataForCurrentUser() {
  const authUserId = await getCurrentAuthUserId();
  if (!authUserId) {
    return {
      techId: null,
      humanMessages: [] as Array<Record<string, unknown>>,
      statusNotes: [] as Array<Record<string, unknown>>,
      activeJobs: [] as Array<Record<string, unknown>>,
      activeJobsError: null,
      eventsError: null,
      notesError: null,
    };
  }

  const response = await apiClient.get<{
    data: {
      techId: string | null;
      humanMessages: Array<Record<string, unknown>>;
      statusNotes: Array<Record<string, unknown>>;
      activeJobs: Array<Record<string, unknown>>;
      activeJobsError: string | null;
      eventsError: string | null;
      notesError: string | null;
    };
  }>("/v1/tech-app/messages-data");

  return response.data;
}

export async function fetchTechJobDetailBundle(jobId: string) {
  const response = await apiClient.get<{
    data: {
      job: Record<string, unknown> | null;
      jobError: string | null;
      services: Array<Record<string, unknown>>;
      servicesError: string | null;
      photos: Array<Record<string, unknown>>;
      photosError: string | null;
    };
  }>("/v1/tech-app/job-detail", { query: { job_id: jobId } });
  return response.data;
}

export interface TechFleetAssignment {
  id: string;
  order_number: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  status: string;
  priority: string | null;
  service_type: string | null;
  description: string | null;
  total: number | null;
  client_name: string | null;
  location_label: string | null;
  vehicle_label: string | null;
  fleet_job_id: string | null;
  fleet_job_number: string | null;
}

/**
 * Fleet work orders assigned to the current technician through the Fleet scheduler.
 * Admin previews see the whole workspace board; technicians see only their assignments.
 */
export async function fetchTechFleetAssignments(identity: TechIdentityLike & { isAdmin?: boolean }): Promise<TechFleetAssignment[]> {
  const scopeUserId = identity.businessUserId || identity.userId;
  const response = await apiClient.get<{ data: FleetAssignmentRow[] }>("/v1/tech-app/fleet-assignments", {
    query: {
      tech_id: identity.techId && !identity.isAdmin ? identity.techId : undefined,
      is_admin: identity.isAdmin ? "true" : "false",
      user_id: scopeUserId || undefined,
    },
  });

  return ((response.data ?? []) as unknown as FleetAssignmentRow[]).map((row) => {
    const vehicle = row.fleet_vehicles;
    const vehicleLabel = vehicle
      ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") +
        (vehicle.unit_number ? ` · Unit ${vehicle.unit_number}` : vehicle.license_plate ? ` · ${vehicle.license_plate}` : "")
      : null;
    return {
      id: row.id,
      order_number: row.order_number ?? null,
      scheduled_date: row.scheduled_date ?? null,
      scheduled_time: row.scheduled_time ?? null,
      status: row.status ?? "scheduled",
      priority: row.priority ?? null,
      service_type: row.service_type ?? null,
      description: row.description ?? null,
      total: row.total ?? null,
      client_name: row.fleet_clients?.company_name ?? null,
      location_label: row.fleet_locations?.address || row.fleet_locations?.name || null,
      vehicle_label: vehicleLabel,
      fleet_job_id: row.fleet_job_id ?? null,
      fleet_job_number: row.fleet_jobs?.job_number ?? null,
    };

  });
}

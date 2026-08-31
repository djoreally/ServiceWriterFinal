import { addDays, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
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

function getSupabaseErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : undefined;
}

function shouldUseTechnicianContextFallback(error: unknown): boolean {
  const code = getSupabaseErrorCode(error);
  const message = error instanceof Error ? error.message : String(error ?? "");

  return (
    code === "PGRST202" ||
    message.includes("get_technician_app_context_v1") ||
    message.includes("record \"v_shift\" is not assigned yet") ||
    message.includes("record \"v_van\" is not assigned yet")
  );
}

async function fetchTechnicianAppContextFallback(): Promise<TechnicianAppContext> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  const now = new Date().toISOString();
  if (!user?.id) {
    return {
      user_id: "",
      workspace_user_id: "",
      technician_id: null,
      technician_name: "Technician",
      role: "technician",
      is_admin_preview: false,
      access_state: "unauthenticated",
      presence_state: "off_shift",
      field_status: null,
      shift_id: null,
      shift_status: null,
      clock_in: null,
      van_id: null,
      van_name: null,
      push_notifications_enabled: true,
      data_fresh_at: now,
    };
  }

  const { data: tech } = await supabase
    .from("technicians")
    .select("id, user_id, name, status, auth_user_id, invitation_id, is_active")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const technician = tech as {
    id: string;
    user_id: string;
    name: string | null;
    status: string | null;
    auth_user_id: string | null;
    invitation_id: string | null;
    is_active: boolean | null;
  } | null;

  if (!technician) {
    return {
      user_id: user.id,
      workspace_user_id: user.id,
      technician_id: null,
      technician_name: "Workspace Preview",
      role: "admin",
      is_admin_preview: true,
      access_state: "admin_preview",
      presence_state: "off_shift",
      field_status: null,
      shift_id: null,
      shift_status: null,
      clock_in: null,
      van_id: null,
      van_name: null,
      push_notifications_enabled: true,
      data_fresh_at: now,
    };
  }

  const [shiftResult, vanResult, preferencesResult] = await Promise.all([
    supabase
      .from("time_clock_entries")
      .select("id, clock_in, status")
      .eq("user_id", user.id)
      .in("status", ["active", "on_break"])
      .order("clock_in", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("vans")
      .select("id, name")
      .eq("assigned_technician_id", technician.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("technician_notification_preferences")
      .select("push_notifications_enabled")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const shift = shiftResult.data as { id: string; clock_in: string | null; status: string | null } | null;
  const van = vanResult.data as { id: string; name: string | null } | null;
  const preferences = preferencesResult.data as { push_notifications_enabled: boolean | null } | null;
  const accessState = technician.is_active === false ? "deactivated" : "linked";
  const presenceState = accessState === "deactivated"
    ? "deactivated"
    : !shift
      ? "off_shift"
      : shift.status === "on_break"
        ? "on_break"
        : ["en_route", "arrived", "in_progress"].includes(technician.status ?? "")
          ? technician.status ?? "available"
          : "available";

  return {
    user_id: user.id,
    workspace_user_id: technician.user_id,
    technician_id: technician.id,
    technician_name: technician.name || "Technician",
    role: "technician",
    is_admin_preview: false,
    access_state: accessState,
    presence_state: presenceState,
    field_status: technician.status,
    shift_id: shift?.id ?? null,
    shift_status: shift?.status ?? null,
    clock_in: shift?.clock_in ?? null,
    van_id: van?.id ?? null,
    van_name: van?.name ?? null,
    push_notifications_enabled: preferences?.push_notifications_enabled ?? true,
    data_fresh_at: now,
  };
}

export async function fetchTechnicianAppContext(): Promise<TechnicianAppContext> {
  const { data, error } = await supabase.rpc("get_technician_app_context_v1" as never);
  if (!error && data) return data as unknown as TechnicianAppContext;
  if (!shouldUseTechnicianContextFallback(error)) throw error;
  return fetchTechnicianAppContextFallback();
}

export async function fetchTechnicianJobWorkspace(jobId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc("get_technician_job_workspace_v1" as never, { p_job_id: jobId } as never);
  if (error) throw error;
  return data as unknown as Record<string, unknown>;
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
  const { data, error } = await supabase.rpc("get_technician_session_v2" as never);
  if (error) throw error;
  const session = data as unknown as TechSession;
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
  const { data, error } = await supabase.rpc("get_technician_job_workspace_v2" as never, { p_job_id: jobId } as never);
  if (error) throw error;
  const workspace = data as unknown as TechJobWorkspace;
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

interface FleetLineItemRow {
  id: string;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
}

const EMPTY_QUERY_RESULT: { data: null; error: null } = { data: null, error: null };

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

export async function fetchTechnicianIdByAuthUserId(authUserId: string): Promise<string | null> {
  const { data } = await supabase
    .from("technicians")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  return (data as { id?: string } | null)?.id ?? null;
}

export async function fetchTechMoreDataForCurrentUser() {
  const authUserId = await getCurrentAuthUserId();
  if (!authUserId) {
    return { tech: null, clockEntry: null };
  }

  const [techResult, clockResult] = await Promise.all([
    supabase
      .from("technicians")
      .select("id, name, email, status, performance_score, vans(name)")
      .eq("auth_user_id", authUserId)
      .single(),
    supabase
      .from("time_clock_entries")
      .select("id, clock_in, status")
      .eq("user_id", authUserId)
      .in("status", ["active", "on_break"])
      .order("clock_in", { ascending: false })
      .limit(1),
  ]);

  return {
    tech: (techResult.data as Record<string, unknown> | null) ?? null,
    clockEntry: (clockResult.data?.[0] as Record<string, unknown> | null) ?? null,
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
    supabase
      .from("time_clock_entries")
      .select("clock_in, clock_out")
      .eq("user_id", identity.userId)
      .gte("clock_in", `${today}T00:00:00`),
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

  const techId = await fetchTechnicianIdByAuthUserId(authUserId);
  if (!techId) {
    return { vanId: null, vanName: "", items: [] as Array<Record<string, unknown>> };
  }

  const { data: vanData } = await supabase
    .from("vans")
    .select("id, name")
    .eq("assigned_technician_id", techId)
    .limit(1)
    .maybeSingle();

  if (!vanData) {
    return { vanId: null, vanName: "", items: [] as Array<Record<string, unknown>> };
  }

  const { data } = await supabase
    .from("van_inventory")
    .select("id, quantity, min_quantity, inventory_items(id, name, sku, category, unit_cost)")
    .eq("van_id", vanData.id);

  return {
    vanId: vanData.id,
    vanName: vanData.name,
    items: (data ?? []) as Array<Record<string, unknown>>,
  };
}

export async function fetchTechProfileDataForCurrentUser() {
  const authUserId = await getCurrentAuthUserId();
  if (!authUserId) {
    return { tech: null, skills: [] as Array<Record<string, unknown>> };
  }

  const { data: techData } = await supabase
    .from("technicians")
    .select("id, name, email, phone, status, performance_score, customer_rating_avg, vans(name)")
    .eq("auth_user_id", authUserId)
    .single();

  if (!techData) {
    return { tech: null, skills: [] as Array<Record<string, unknown>> };
  }

  const { data: skillsData } = await supabase
    .from("technician_skills")
    .select("id, skill_type, certification_level, is_active")
    .eq("is_active", true)
    .eq("technician_id", techData.id);

  return {
    tech: {
      ...(techData as Record<string, unknown>),
      total_jobs_completed: null as number | null,
    },
    skills: (skillsData ?? []) as Array<Record<string, unknown>>,
  };
}

export async function fetchTechNotificationSettingsForCurrentUser() {
  const authUserId = await getCurrentAuthUserId();
  if (!authUserId) {
    return normalizeTechNotificationPreferences(null);
  }

  const { data, error } = await supabase
    .from("technician_notification_preferences")
    .select("push_notifications_enabled, dispatch_push_enabled, customer_sms_enabled, customer_email_enabled, offline_cache_enabled")
    .eq("user_id", authUserId)
    .maybeSingle();

  if (error) throw error;

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

  const { data: techData } = await supabase
    .from("technicians")
    .select("id")
    .eq("auth_user_id", authUserId)
    .single();

  if (!techData) {
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

  const [{ data: events, error: eventsError }, { data: activeJobs, error: activeJobsError }, { data: notes, error: notesError }] = await Promise.all([
    supabase
      .from("dispatch_events")
      .select("id, appointment_id, event_type, notes, created_at, performed_by")
      .eq("technician_id", techData.id)
      .eq("event_type", "note_added")
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("appointments")
      .select("id, title, scheduled_date, scheduled_time, dispatch_status, status")
      .eq("assigned_technician_id", techData.id)
      .not("status", "in", '("completed","cancelled")')
      .or("dispatch_status.is.null,dispatch_status.not.in.(completed,cancelled)")
      .order("scheduled_date", { ascending: true })
      .order("scheduled_time", { ascending: true })
      .limit(25),
    supabase
      .from("appointments")
      .select("id, dispatch_notes, updated_at, dispatch_status, status")
      .eq("assigned_technician_id", techData.id)
      .not("dispatch_notes", "is", null)
      .order("updated_at", { ascending: false })
      .limit(40),
  ]);

  return {
    techId: techData.id,
    humanMessages: (events ?? []) as Array<Record<string, unknown>>,
    statusNotes: (notes ?? []) as Array<Record<string, unknown>>,
    activeJobs: (activeJobs ?? []) as Array<Record<string, unknown>>,
    activeJobsError,
    eventsError,
    notesError,
  };
}

export async function fetchTechJobDetailBundle(jobId: string) {
  // The canonical workspace RPC is the ONLY authority for which table a job lives
  // in. There is no catch-all fallback to broader direct table reads: a failing
  // RPC surfaces an explicit error instead of silently widening data access.
  const workspaceJob = await fetchTechnicianJobWorkspace(jobId);
  const source = workspaceJob?.source as string | undefined;
  if (!source) {
    throw new Error("Job access could not be resolved for this technician.");
  }
  // Try Retail first
  const retailResult = source !== "fleet_work_order" ? await supabase

    .from("appointments")
    .select(
      `
        id, scheduled_date, scheduled_time, estimated_duration_minutes,
        dispatch_status, job_priority, status, location_address, location_lat, location_lng,
        notes, dispatch_notes, estimated_cost, payment_status,
        user_id, customer_id, vehicle_id,
        customers(name, phone, email),
        vehicles(year, make, model, color, vin, license_plate),
        service_catalog(name),
        technicians(id, name),
        vans(name)
      `,
    )
    .eq("id", jobId)
    .maybeSingle() : EMPTY_QUERY_RESULT;

  if (retailResult.data) {
    const [servicesResult, photosResult] = await Promise.all([
      supabase
        .from("appointment_services")
        .select("id, quantity, is_prepaid, service_catalog(name, price)")
        .eq("appointment_id", jobId),
      supabase
        .from("job_photos")
        .select("id, photo_type, storage_path, file_name, created_at")
        .eq("appointment_id", jobId)
        .order("created_at", { ascending: false }),
    ]);

    return {
      job: { ...retailResult.data, is_fleet: false } as Record<string, unknown>,
      jobError: null as string | null,
      services: (servicesResult.data ?? []) as Array<Record<string, unknown>>,
      servicesError: servicesResult.error,
      photos: (photosResult.data ?? []) as Array<Record<string, unknown>>,
      photosError: photosResult.error,
    };
  }

  // Try Fleet (also the fallback when the workspace RPC could not classify the job)
  const fleetResult = source !== "appointment" ? await supabase

    .from("fleet_work_orders")
    .select(
      `
        id, scheduled_date, scheduled_time, status, priority, service_type, description, notes, technician_notes,
        fleet_client_id, fleet_vehicle_id, fleet_location_id, user_id,
        fleet_clients(company_name, phone),
        fleet_vehicles(year, make, model, color, vin, license_plate, mileage),
        fleet_locations(address, name, latitude, longitude),
        technicians(id, name),
        vans(name)
      `,
    )
    .eq("id", jobId)
    .maybeSingle() : EMPTY_QUERY_RESULT;

  if (fleetResult.data) {
    const f = fleetResult.data;
    // Map Fleet to Job structure
    const mappedJob = {
      id: f.id,
      scheduled_date: f.scheduled_date,
      scheduled_time: f.scheduled_time,
      estimated_duration_minutes: 60,
      dispatch_status: f.status,
      status: f.status,
      job_priority: f.priority,
      location_address: f.fleet_locations?.address || f.fleet_locations?.name,
      location_lat: f.fleet_locations?.latitude ?? null,
      location_lng: f.fleet_locations?.longitude ?? null,
      notes: f.technician_notes,
      dispatch_notes: f.description,
      estimated_cost: null,
      payment_status: null,
      user_id: f.user_id,
      customer_id: null,
      vehicle_id: f.fleet_vehicle_id,
      customers: { name: f.fleet_clients?.company_name, phone: f.fleet_clients?.phone, email: null },
      vehicles: f.fleet_vehicles,
      service_catalog: { name: f.service_type || "Fleet Service" },
      technicians: f.technicians,
      vans: f.vans,
      is_fleet: true
    };

    const lineItems = await supabase
      .from("fleet_work_order_line_items")
      .select("id, description, quantity, unit_price")
      .eq("fleet_work_order_id", jobId);

    return {
      job: mappedJob as Record<string, unknown>,
      jobError: null as string | null,
      services: ((lineItems.data ?? []) as FleetLineItemRow[]).map((li) => ({
        id: li.id,
        service_catalog: { name: li.description, price: li.unit_price },
        quantity: li.quantity,
        is_prepaid: false
      })) as Array<Record<string, unknown>>,
      servicesError: null as string | null,
      photos: [] as Array<Record<string, unknown>>,
      photosError: null as string | null,
    };
  }

  return {
    job: null,
    jobError: new Error("Job not found") as unknown as string | null,
    services: [] as Array<Record<string, unknown>>,
    servicesError: null as string | null,
    photos: [] as Array<Record<string, unknown>>,
    photosError: null as string | null,
  };
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
  let query = supabase
    .from("fleet_work_orders")
    .select(
      `id, order_number, scheduled_date, scheduled_time, status, priority, service_type, description, total, fleet_job_id,
       fleet_jobs(job_number),
       fleet_clients(company_name),
       fleet_locations(name, address),
       fleet_vehicles(year, make, model, unit_number, license_plate)`,
    )
    .order("scheduled_date", { ascending: true })
    .order("scheduled_time", { ascending: true })
    .limit(200);


  if (identity.techId && !identity.isAdmin) {
    query = query.eq("assigned_technician_id", identity.techId);
  } else if (scopeUserId) {
    query = query.eq("user_id", scopeUserId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as unknown as FleetAssignmentRow[]).map((row) => {
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

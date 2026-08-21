import { supabase } from "@/integrations/supabase/client";
import { buildCommandCenterBuckets } from "@/lib/command-center-filters";
import { openCommunicationThreadsForJobs } from "@/application/queries/job-thread.query";

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
  source: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  service_catalog_name: string | null;
  last_event_at: string | null;
  source_freshness_ms: number | null;
  fleet_job_id: string | null;
  fleet_job_number: string | null;
  fleet_job_vehicle_count: number | null;
}

/**
 * Cross-domain operational read model. Consumers must explicitly select their
 * domain (`appointment` or `fleet_work_order`) before rendering a work queue.
 */
export async function fetchOperationalJobsByDate(userId: string, dateStr: string) {
  const client = supabase as any;
  const res = await client
    .from("dispatch_operational_jobs_v1")
    .select("*")
    .eq("user_id", userId)
    .eq("scheduled_date", dateStr)
    .order("scheduled_time", { ascending: true });
  if (!res.error) {
    await openCommunicationThreadsForJobs((res.data ?? []) as OperationalJobRow[]);
  }
  return res;
}

export async function fetchOperationalJobsByDateRange(userId: string, fromDate: string, toDate: string) {
  const client = supabase as any;
  const res = await client
    .from("dispatch_operational_jobs_v1")
    .select("*")
    .eq("user_id", userId)
    .gte("scheduled_date", fromDate)
    .lte("scheduled_date", toDate)
    .order("scheduled_date", { ascending: true })
    .order("scheduled_time", { ascending: true });
  if (!res.error) {
    await openCommunicationThreadsForJobs((res.data ?? []) as OperationalJobRow[]);
  }
  return res;
}

export async function fetchAllUpcomingOperationalJobs(userId: string) {
  const client = supabase as any;
  const today = new Date().toISOString().slice(0, 10);
  const res = await client
    .from("dispatch_operational_jobs_v1")
    .select("*")
    .eq("user_id", userId)
    .gte("scheduled_date", today)
    .order("scheduled_date", { ascending: true })
    .order("scheduled_time", { ascending: true });
  if (!res.error) {
    await openCommunicationThreadsForJobs((res.data ?? []) as OperationalJobRow[]);
  }
  return res;
}

export async function fetchLifecycleSurfaceParity(userId: string, dateStr: string) {
  const { data, error } = await fetchOperationalJobsByDate(userId, dateStr);
  if (error) throw error;

  const jobs = ((data ?? []) as OperationalJobRow[]).map((row) => ({
    id: row.job_id,
    status: row.status,
    dispatch_status: row.dispatch_status,
  }));

  const command = buildCommandCenterBuckets(jobs);
  const dispatch = buildCommandCenterBuckets(jobs);
  const technician = buildCommandCenterBuckets(jobs);

  return {
    command: {
      queue: command.queue.length,
      active: command.active.length,
      completed: command.completed.length,
      cancelled: command.cancelled.length,
    },
    dispatch: {
      queue: dispatch.queue.length,
      active: dispatch.active.length,
      completed: dispatch.completed.length,
      cancelled: dispatch.cancelled.length,
    },
    technician: {
      queue: technician.queue.length,
      active: technician.active.length,
      completed: technician.completed.length,
      cancelled: technician.cancelled.length,
    },
    isAligned:
      command.queue.length === dispatch.queue.length
      && command.active.length === dispatch.active.length
      && command.completed.length === dispatch.completed.length
      && command.cancelled.length === dispatch.cancelled.length
      && command.queue.length === technician.queue.length
      && command.active.length === technician.active.length
      && command.completed.length === technician.completed.length
      && command.cancelled.length === technician.cancelled.length,
  };
}

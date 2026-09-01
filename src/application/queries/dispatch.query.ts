/**
 * Dispatch Query - Fetches data for the DispatchBoard component.
 */

import { supabase } from "@/integrations/supabase/client";
import { addDays, format } from "date-fns";
import { fetchOperationalJobsByDate, fetchOperationalJobsByDateRange, fetchAllUpcomingOperationalJobs, type OperationalJobRow } from "./operational-jobs.query";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
export interface DispatchTechnician {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  status: "available" | "busy" | "offline" | "on_break" | "on_job";
  skills: string[];
  current_location: { lat: number; lng: number } | null;
  last_location_update: string | null;
  max_jobs_per_day: number;
}

export interface DispatchVan {
  id: string;
  name: string;
  status: string;
  assigned_technician_id: string | null;
  territory_count?: number;
}

export interface DispatchJob {
  id: string;
  source: "appointment" | "work_order";
  title: string;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
  dispatch_status: string;
  job_priority: string;
  estimated_duration_minutes: number | null;
  assigned_technician_id: string | null;
  assigned_van_id: string | null;
  assigned_at: string | null;
  dispatch_notes: string | null;
  customer: { name: string; phone: string | null } | null;
  vehicle: { year: number; make: string; model: string } | null;
  service_catalog: { name: string } | null;
  guest_name: string | null;
}

export interface DispatchBoardData {
  technicians: DispatchTechnician[];
  vans: DispatchVan[];
  jobs: DispatchJob[];
  inventoryCount: number;
}

/** Fetch all dispatch board data for a given date. */
export async function fetchDispatchBoardData(selectedDate: Date, viewMode: "day" | "week" | "all" = "day"): Promise<DispatchBoardData> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");

  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const endDateStr = format(addDays(selectedDate, 6), "yyyy-MM-dd");

  const [techRes, vanRes, jobRes, invRes, terrRes] = await Promise.all([
    supabase.from("technicians").select("*").eq("is_active", true).order("name"),
    supabase.from("vans").select("id, name, status, assigned_technician_id")
      .eq("user_id", user.id).eq("is_active", true).order("name"),
    viewMode === "all"
      ? fetchAllUpcomingOperationalJobs(user.id)
      : viewMode === "week"
        ? fetchOperationalJobsByDateRange(user.id, dateStr, endDateStr)
        : fetchOperationalJobsByDate(user.id, dateStr),
    supabase.from("van_inventory").select("id", { count: "exact", head: true }),
    supabase.from("van_territories").select("van_id"),
  ]);

  // Enrich vans with territory counts
  const terrMap = new Map<string, number>();
  (terrRes.data ?? []).forEach((t: any) =>
    terrMap.set(t.van_id, (terrMap.get(t.van_id) || 0) + 1)
  );
  const vans = (vanRes.data ?? []).map((v: any) => ({
    ...v,
    territory_count: terrMap.get(v.id) || 0,
  })) as DispatchVan[];

  return {
    technicians: (techRes.data ?? []) as unknown as DispatchTechnician[],
    vans,
    jobs: ((jobRes.data ?? []) as OperationalJobRow[])
      .map((job) => ({
        id: job.job_id,
        source: job.source,
        title: job.title,
        scheduled_date: job.scheduled_date,
        scheduled_time: job.scheduled_time,
        status: job.status ?? "pending",
        dispatch_status: job.dispatch_status ?? "unassigned",
        job_priority: job.job_priority ?? "normal",
        estimated_duration_minutes: job.estimated_duration_minutes ?? job.duration_minutes,
        assigned_technician_id: job.assigned_technician_id,
        assigned_van_id: job.assigned_van_id,
        assigned_at: job.assigned_at,
        dispatch_notes: job.dispatch_notes,
        customer: job.customer_name ? { name: job.customer_name, phone: job.customer_phone ?? null } : null,
        vehicle: job.vehicle_year || job.vehicle_make || job.vehicle_model
          ? {
              year: job.vehicle_year ?? 0,
              make: job.vehicle_make ?? "",
              model: job.vehicle_model ?? "",
            }
          : null,
        service_catalog: job.service_catalog_name ? { name: job.service_catalog_name } : null,
        guest_name: job.guest_name,
      })),
    inventoryCount: invRes.count || 0,
  };
}

/** Subscribe to realtime dispatch changes. Returns cleanup function. */
export async function subscribeToDispatchChanges(onUpdate: () => void): Promise<() => void> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return () => undefined;

  const context = await resolveCurrentWorkspace();
  if (!context) return () => undefined;

  const channel = supabase
    .channel(`dispatch-updates:${context.workspaceId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `workspace_id=eq.${context.workspaceId}` }, onUpdate)
    .on("postgres_changes", { event: "*", schema: "public", table: "work_orders", filter: `workspace_id=eq.${context.workspaceId}` }, onUpdate)
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

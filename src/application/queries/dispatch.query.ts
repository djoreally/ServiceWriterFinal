/** Dispatch Query - canonical workspace technicians + operational jobs. */
import { supabase } from "@/integrations/supabase/client";
import { addDays, format } from "date-fns";
import { fetchOperationalJobsByDate, fetchOperationalJobsByDateRange, fetchAllUpcomingOperationalJobs, type OperationalJobRow } from "./operational-jobs.query";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

const db = supabase as any;

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

function location(value: unknown): { lat: number; lng: number } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const lat = Number(record.lat);
  const lng = Number(record.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export async function fetchDispatchBoardData(selectedDate: Date, viewMode: "day" | "week" | "all" = "day"): Promise<DispatchBoardData> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Select a workspace before opening dispatch.");

  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const endDateStr = format(addDays(selectedDate, 6), "yyyy-MM-dd");
  const [membersRes, presenceRes, jobRes] = await Promise.all([
    db
      .from("workspace_members")
      .select("user_id,role,is_active,profiles!workspace_members_user_id_fkey(display_name,phone,avatar_url)")
      .eq("workspace_id", context.workspaceId)
      .eq("is_active", true)
      .in("role", ["technician", "owner", "manager"]),
    db
      .from("technician_presence")
      .select("user_id,status,current_location,last_seen_at")
      .eq("workspace_id", context.workspaceId),
    viewMode === "all"
      ? fetchAllUpcomingOperationalJobs(user.id)
      : viewMode === "week"
        ? fetchOperationalJobsByDateRange(user.id, dateStr, endDateStr)
        : fetchOperationalJobsByDate(user.id, dateStr),
  ]);
  if (membersRes.error) throw membersRes.error;
  if (presenceRes.error) throw presenceRes.error;
  if (jobRes.error) throw jobRes.error;

  const presenceByUser = new Map((presenceRes.data ?? []).map((row: any) => [row.user_id, row]));
  const technicians: DispatchTechnician[] = (membersRes.data ?? []).map((member: any) => {
    const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
    const presence = presenceByUser.get(member.user_id) as any;
    const status = presence?.status === "on_job" || presence?.status === "en_route"
      ? "on_job"
      : presence?.status === "on_break"
        ? "on_break"
        : presence?.status === "available"
          ? "available"
          : presence?.status === "unavailable"
            ? "busy"
            : "offline";
    return {
      id: member.user_id,
      name: profile?.display_name || "Technician",
      email: null,
      phone: profile?.phone ?? null,
      avatar_url: profile?.avatar_url ?? null,
      status,
      skills: [],
      current_location: location(presence?.current_location),
      last_location_update: presence?.last_seen_at ?? null,
      max_jobs_per_day: 8,
    };
  });

  return {
    technicians,
    vans: [],
    jobs: ((jobRes.data ?? []) as OperationalJobRow[]).map((job) => ({
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
      assigned_van_id: null,
      assigned_at: job.assigned_at,
      dispatch_notes: job.dispatch_notes,
      customer: job.customer_name ? { name: job.customer_name, phone: job.customer_phone ?? null } : null,
      vehicle: job.vehicle_year || job.vehicle_make || job.vehicle_model
        ? { year: job.vehicle_year ?? 0, make: job.vehicle_make ?? "", model: job.vehicle_model ?? "" }
        : null,
      service_catalog: job.service_catalog_name ? { name: job.service_catalog_name } : null,
      guest_name: job.guest_name,
    })),
    inventoryCount: 0,
  };
}

export async function subscribeToDispatchChanges(onUpdate: () => void): Promise<() => void> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return () => undefined;
  const context = await resolveCurrentWorkspace();
  if (!context) return () => undefined;

  const channel = supabase
    .channel(`dispatch-updates:${context.workspaceId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `workspace_id=eq.${context.workspaceId}` }, onUpdate)
    .on("postgres_changes", { event: "*", schema: "public", table: "work_orders", filter: `workspace_id=eq.${context.workspaceId}` }, onUpdate)
    .on("postgres_changes", { event: "*", schema: "public", table: "technician_presence", filter: `workspace_id=eq.${context.workspaceId}` }, onUpdate)
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

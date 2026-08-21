/**
 * Mobile Dispatch Query — Read operations for field technician job management.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export async function getAuthUser() {
  const { data: { user } } = await getCurrentAuthUser();
  return user;
}

export async function fetchTechnicianRecord(userId: string) {
  return supabase.from("technicians").select("id, status").eq("user_id", userId).single();
}

export async function fetchActiveClockEntry(userId: string) {
  return supabase
    .from("time_clock_entries")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["active", "on_break"])
    .limit(1);
}

export async function fetchTechnicianJobs(technicianId: string) {
  return supabase
    .from("appointments")
    .select(`
      id, scheduled_date, scheduled_time, estimated_duration_minutes,
      dispatch_status, job_priority, actual_start_time, actual_end_time, notes,
      customer:customers(name, phone, address),
      vehicle:vehicles(year, make, model, color, license_plate),
      service_catalog(name)
    `)
    .eq("assigned_technician_id", technicianId)
    .not("dispatch_status", "eq", "completed")
    .not("dispatch_status", "eq", "cancelled")
    .order("scheduled_date")
    .order("scheduled_time");
}

export function subscribeMobileDispatch(callback: () => void) {
  const channel = supabase
    .channel("mobile-dispatch")
    .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => callback())
    .subscribe();
  return { channel, unsubscribe: () => supabase.removeChannel(channel) };
}

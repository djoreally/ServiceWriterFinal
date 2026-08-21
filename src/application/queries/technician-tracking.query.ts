/**
 * Technician Tracking Query — Abstracts technician location, job data, and realtime subscriptions
 */

import { supabase } from "@/integrations/supabase/client";

export async function fetchTrackingTechnicians() {
  return supabase.from("technicians").select("*").order("display_name");
}

export async function fetchActiveDispatchJobs() {
  return supabase
    .from("appointments")
    .select(`
      id,
      scheduled_date,
      scheduled_time,
      dispatch_status,
      assigned_technician_id,
      location_lat,
      location_lng,
      location_address,
      customer:customers(name),
      vehicles(year, make, model),
      service_catalog(name)
    `)
    .not("assigned_technician_id", "is", null)
    .in("dispatch_status", ["assigned", "en_route", "arrived", "in_progress"])
    .order("scheduled_date");
}

export async function fetchTechLocationHistory(technicianId: string) {
  return supabase
    .from("location_history")
    .select("*")
    .eq("technician_id", technicianId)
    .order("recorded_at", { ascending: false })
    .limit(50);
}

export function subscribeToTrackingChanges(onTechChange: () => void, onLocationChange: () => void) {
  const channel = supabase
    .channel("technician-tracking")
    .on("postgres_changes", { event: "*", schema: "public", table: "technicians" }, onTechChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "location_history" }, onLocationChange)
    .subscribe();

  return { channel, unsubscribe: () => supabase.removeChannel(channel) };
}

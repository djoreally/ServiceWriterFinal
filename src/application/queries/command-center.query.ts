/**
 * Command Center Query — Abstracts data access for the Command Center page.
 */
import { supabase } from "@/integrations/supabase/client";
import { addDays, format, parseISO } from "date-fns";
import { fetchOperationalJobsByDateRange } from "./operational-jobs.query";

/** Fetch operational appointments for today + next 6 days. */
export async function fetchTodayJobs(userId: string, dateStr: string) {
  const start = parseISO(dateStr);
  const end = addDays(start, 6);
  return fetchOperationalJobsByDateRange(userId, dateStr, format(end, "yyyy-MM-dd"));
}

/** Fetch active technicians for a user. */
export async function fetchActiveTechnicians(userId: string) {
  const [techsRes, vansRes] = await Promise.all([
    supabase
      .from("technicians")
      .select("id, name, status, avatar_url, current_location")
      .eq("user_id", userId)
      .eq("is_active", true),
    supabase
      .from("vans")
      .select("id, assigned_technician_id")
      .eq("user_id", userId)
      .eq("is_active", true),
  ]);

  if (techsRes.error) return techsRes;

  const vanByTech = new Map<string, string>();
  (vansRes.data || []).forEach((van) => {
    if (van.assigned_technician_id) {
      vanByTech.set(van.assigned_technician_id, van.id);
    }
  });

  const data = (techsRes.data || []).map((tech) => ({
    ...tech,
    assigned_van_id: vanByTech.get(tech.id) || null,
  }));

  return { data, error: null as null | typeof techsRes.error };
}

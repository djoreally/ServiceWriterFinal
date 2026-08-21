/**
 * Time clock queries — Read operations for time clock data.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface TimeClockEntry {
  id: string;
  clock_in: string;
  clock_out: string | null;
  break_start: string | null;
  break_end: string | null;
  break_duration_minutes: number;
  status: "active" | "on_break" | "completed" | "edited";
  total_hours: number | null;
  regular_hours: number | null;
  overtime_hours: number | null;
  clock_in_location: { lat: number; lng: number; address?: string } | null;
  clock_out_location: { lat: number; lng: number; address?: string } | null;
  notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
}

export async function fetchTimeClockData() {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return { activeEntry: null, entries: [] };

  const [activeRes, recentRes] = await Promise.all([
    supabase
      .from("time_clock_entries")
      .select("*")
      .eq("user_id", user.id)
      .in("status", ["active", "on_break"])
      .order("clock_in", { ascending: false })
      .limit(1),
    supabase
      .from("time_clock_entries")
      .select("*")
      .eq("user_id", user.id)
      .order("clock_in", { ascending: false })
      .limit(50),
  ]);

  const activeEntry = activeRes.data?.[0] as unknown as TimeClockEntry | undefined;
  const entries = (recentRes.data || []) as unknown as TimeClockEntry[];

  return { activeEntry: activeEntry || null, entries };
}

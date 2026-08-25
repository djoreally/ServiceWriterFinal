/** Command Center Query — canonical Service Writer operational reads. */
import { supabase } from "@/integrations/supabase/client";
import { addDays, format, parseISO } from "date-fns";
import { fetchOperationalJobsByDateRange } from "./operational-jobs.query";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

/** Fetch Service Writer operational jobs for today + next 6 days. */
export async function fetchTodayJobs(userId: string, dateStr: string) {
  const start = parseISO(dateStr);
  const end = addDays(start, 6);
  return fetchOperationalJobsByDateRange(userId, dateStr, format(end, "yyyy-MM-dd"));
}

/**
 * Active dispatch technicians are active workspace members, not rows in the
 * retired Lovable `technicians`/`vans` tables. Final does not yet persist live
 * technician GPS, so location is intentionally null until that capability is
 * rebuilt on the canonical schema.
 */
export async function fetchActiveTechnicians(_userId: string) {
  try {
    const context = await resolveCurrentWorkspace();
    if (!context) return { data: [], error: null };
    const { data, error } = await (supabase as any)
      .from("workspace_members")
      .select("user_id,role,profiles!workspace_members_user_id_fkey(display_name,avatar_url)")
      .eq("workspace_id", context.workspaceId)
      .eq("is_active", true)
      .in("role", ["technician", "owner", "manager"])
      .order("created_at");
    if (error) return { data: null, error };

    return {
      data: (data ?? []).map((member: any) => ({
        id: member.user_id,
        name: member.profiles?.display_name || (member.role === "owner" ? "Owner" : "Technician"),
        status: "available",
        avatar_url: member.profiles?.avatar_url ?? null,
        current_location: null,
        assigned_van_id: null,
      })),
      error: null,
    };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error("Failed to load technicians") };
  }
}

/**
 * Dispatch Monitor Queries
 * Abstracts dispatch engine invocations and appointment fetching for the monitor page.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { assignTechnician } from "@/application/commands/dispatch.command";

export type DispatchableAppointment = Pick<
  Database["public"]["Tables"]["appointments"]["Row"],
  "id" | "title" | "scheduled_date" | "scheduled_time" | "status" | "duration_minutes"
>;

export interface RankedCandidate {
  rank: number;
  technician_id: string;
  name: string;
  final_score: number;
  score_breakdown: {
    distance: number;
    load: number;
    performance: number;
    fairness: number;
    route: number;
  };
  distance_miles: number | null;
  scheduled_hours_today: number;
  performance_score: number;
  status: string;
}

export interface DispatchMonitorResult {
  success: boolean;
  auto_assigned?: boolean;
  error?: string;
  top_recommendation?: RankedCandidate;
  ranked_candidates?: RankedCandidate[];
  eliminated_count?: number;
  eliminated?: Array<{ name: string; reason: string }>;
  weights_used?: Record<string, number>;
  fleet_mode?: boolean;
  candidates_evaluated?: number;
  message?: string;
  skill_filter_applied?: boolean;
}

/** Fetch unfinished appointments for dispatch monitor dropdown */
export async function fetchDispatchableAppointments() {
  const { data: workspaceOwnerId, error: workspaceError } = await supabase.rpc("current_workspace_owner_user_id");
  if (workspaceError) return { data: null as any, error: workspaceError };
  return supabase
    .from("appointments")
    .select("id, title, scheduled_date, scheduled_time, status, duration_minutes")
    .eq("user_id", workspaceOwnerId)
    .not("status", "in", '("completed","cancelled")')
    .order("scheduled_date", { ascending: true })
    .limit(50);
}

/** Run dispatch engine check (monitor mode, no auto-assign) */
export async function invokeDispatchEngine(body: Record<string, unknown>): Promise<{ data: DispatchMonitorResult | null; error: any }> {
  const estimatedDuration = Number(body.estimated_duration_minutes ?? body.estimated_duration ?? 60);
  return supabase.functions.invoke<DispatchMonitorResult>("dispatch-engine", {
    body: { ...body, estimated_duration_minutes: estimatedDuration },
  });
}

/** Assign a technician to an appointment via RPC */
export async function assignTechnicianRpc(
  appointmentId: string,
  technicianId: string,
  notes: string
) {
  try {
    await assignTechnician(appointmentId, technicianId, notes);
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error : new Error("Assignment failed") };
  }
}

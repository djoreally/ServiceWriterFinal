/**
 * Dispatch Monitor Queries
 * Canonical appointment reads use workspace_id + starts_at + metadata.
 */
import { supabase } from "@/integrations/supabase/client";
import { assignTechnician } from "@/application/commands/dispatch.command";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface DispatchableAppointment {
  id: string;
  title: string;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
  duration_minutes: number;
}

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

function meta(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/** Fetch unfinished appointments for dispatch monitor dropdown. */
export async function fetchDispatchableAppointments() {
  const context = await resolveCurrentWorkspace();
  if (!context) return { data: null, error: new Error("No active workspace is available.") };

  const { data, error } = await (supabase as any)
    .from("appointments")
    .select("id,status,starts_at,ends_at,metadata")
    .eq("workspace_id", context.workspaceId)
    .not("status", "in", '("completed","cancelled")')
    .order("starts_at", { ascending: true })
    .limit(50);

  if (error) return { data: null, error };

  const mapped: DispatchableAppointment[] = (data ?? []).map((row: any) => {
    const start = row.starts_at ? new Date(row.starts_at) : null;
    const end = row.ends_at ? new Date(row.ends_at) : null;
    const metadata = meta(row.metadata);
    const duration = start && end && Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())
      ? Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000))
      : Number(metadata.duration_minutes ?? metadata.estimated_duration_minutes ?? 60) || 60;

    return {
      id: row.id,
      title: String(metadata.title ?? metadata.service_name ?? "Service Appointment"),
      scheduled_date: start && Number.isFinite(start.getTime()) ? start.toISOString().slice(0, 10) : "",
      scheduled_time: start && Number.isFinite(start.getTime()) ? start.toISOString().slice(11, 19) : "",
      status: row.status ?? "pending",
      duration_minutes: duration,
    };
  });

  return { data: mapped, error: null };
}

export async function invokeDispatchEngine(
  body: Record<string, unknown>,
): Promise<{ data: DispatchMonitorResult | null; error: unknown }> {
  const estimatedDuration = Number(body.estimated_duration_minutes ?? body.estimated_duration ?? 60);
  const result = await supabase.functions.invoke("dispatch-engine", {
    body: { ...body, estimated_duration_minutes: estimatedDuration },
  });

  return {
    data: result.data as DispatchMonitorResult | null,
    error: result.error,
  };
}

export async function assignTechnicianRpc(
  appointmentId: string,
  technicianId: string,
  notes: string,
) {
  try {
    await assignTechnician(appointmentId, technicianId, notes);
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error : new Error("Assignment failed") };
  }
}

/**
 * Technician OS Query — Read-only data access for the TechnicianOS page.
 * All write operations have been moved to technician-os.command.ts.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
/** Get the current authenticated user. */
export async function getCurrentUser() {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return null;
  const { data: workspaceOwnerId, error } = await supabase.rpc("current_workspace_owner_user_id");
  if (error) throw error;
  return { ...user, id: workspaceOwnerId || user.id };
}

/** Fetch the complete technician roster for a workspace, including inactive records. */
export async function fetchTechnicians(userId: string) {
  return supabase
    .from("technicians")
    .select("*")
    .eq("user_id", userId)
    .order("name");
}

export interface TeamOsTechnicianSnapshot {
  technician_id: string;
  workspace_user_id: string;
  access_state: "roster_only" | "invited" | "linked" | "locked" | "deactivated";
  employment_state: "active" | "inactive";
  field_status: string;
  assigned_van_id: string | null;
  assigned_van_name: string | null;
  completed_jobs: number;
  collected_revenue: number;
  productive_minutes: number;
  available_minutes: number;
  utilization: number;
  active_skill_count: number;
  expiring_skill_count: number;
  compliance_issue_count: number;
  onboarding_open_count: number;
  current_job: Record<string, unknown> | null;
  next_job: Record<string, unknown> | null;
  data_fresh_at: string;
}

/** Canonical Team OS roster snapshot and metrics for an explicit period. */
export async function fetchTeamOsTechnicianSnapshot(fromDate: string, toDate: string): Promise<TeamOsTechnicianSnapshot[]> {
  const { data, error } = await (supabase as any).rpc("get_team_os_technician_snapshot_v1", {
    p_from: fromDate,
    p_to: toDate,
  });
  if (error) throw error;
  return (data ?? []) as TeamOsTechnicianSnapshot[];
}

/** Fetch active vans for a user. */
export async function fetchVans(userId: string) {
  return supabase
    .from("vans")
    .select("id, name, assigned_technician_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("name");
}

/** Fetch the van assigned to a technician. */
export async function fetchAssignedVan(techId: string) {
  return supabase
    .from("vans")
    .select("id")
    .eq("assigned_technician_id", techId)
    .maybeSingle();
}

/** Fetch all detail data for a single technician (skills, payroll, incidents, etc.). */
export async function fetchTechDetails(techId: string) {
  const [skills, payroll, incidents, onboarding, leave, appraisals, docs] = await Promise.all([
    supabase.from("technician_skills").select("*").eq("technician_id", techId).eq("is_active", true).order("skill_type"),
    supabase.from("technician_payroll_cycles").select("*").eq("technician_id", techId).order("cycle_start", { ascending: false }).limit(6),
    supabase.from("technician_incidents").select("*").eq("technician_id", techId).order("incident_date", { ascending: false }).limit(10),
    supabase.from("technician_onboarding_tasks").select("*").eq("technician_id", techId).order("created_at"),
    supabase.from("technician_leave_requests").select("*").eq("technician_id", techId).order("start_date", { ascending: false }),
    supabase.from("technician_appraisals").select("*").eq("technician_id", techId).order("review_date", { ascending: false }),
    supabase.from("technician_documents").select("*").eq("technician_id", techId).order("created_at", { ascending: false }),
  ]);
  return { skills, payroll, incidents, onboarding, leave, appraisals, docs };
}

/** Fetch a single technician by ID. */
export async function fetchTechnicianById(techId: string) {
  return supabase.from("technicians").select("*").eq("id", techId).single();
}

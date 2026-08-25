/** Canonical Technician Hub reads for Final. */
import { supabase } from "@/integrations/supabase/client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import { fetchOperationalJobsByDate } from "@/application/queries/operational-jobs.query";
import { format } from "date-fns";

export interface TechnicianRosterRow {
  id: string;
  name: string;
  phone: string | null;
  avatar_url: string | null;
  role: string;
  is_active: boolean;
  jobs_today: number;
  active_jobs: number;
  completed_today: number;
}

export async function getCurrentUser() {
  const { data: { user } } = await getCurrentAuthUser();
  return user ?? null;
}

export async function fetchTechnicianRoster(): Promise<{ data: TechnicianRosterRow[]; error: any }> {
  try {
    const context = await resolveCurrentWorkspace();
    if (!context) return { data: [], error: null };
    const today = format(new Date(), "yyyy-MM-dd");
    const [membersRes, jobsRes] = await Promise.all([
      (supabase.from("workspace_members") as any)
        .select("user_id,role,is_active,profiles!workspace_members_user_id_fkey(display_name,phone,avatar_url)")
        .eq("workspace_id", context.workspaceId)
        .in("role", ["technician", "owner", "manager"])
        .order("created_at"),
      fetchOperationalJobsByDate("", today),
    ]);
    if (membersRes.error) return { data: [], error: membersRes.error };
    if (jobsRes.error) return { data: [], error: jobsRes.error };

    const jobs = jobsRes.data ?? [];
    const data = (membersRes.data ?? []).map((member: any) => {
      const assigned = jobs.filter((job) => job.assigned_technician_id === member.user_id);
      const completed = assigned.filter((job) => job.status === "completed");
      const active = assigned.filter((job) => !["completed", "cancelled", "no_show"].includes(String(job.status)));
      return {
        id: member.user_id,
        name: member.profiles?.display_name || (member.role === "owner" ? "Owner" : "Technician"),
        phone: member.profiles?.phone ?? null,
        avatar_url: member.profiles?.avatar_url ?? null,
        role: String(member.role),
        is_active: Boolean(member.is_active),
        jobs_today: assigned.length,
        active_jobs: active.length,
        completed_today: completed.length,
      } satisfies TechnicianRosterRow;
    });
    return { data, error: null };
  } catch (error) {
    return { data: [], error: error instanceof Error ? error : new Error("Failed to load technician roster") };
  }
}

/** Compatibility adapter used by older callers while Team OS is simplified. */
export async function fetchTechnicians(_userId: string) {
  return fetchTechnicianRoster();
}

export async function fetchTechnicianById(techId: string) {
  const { data, error } = await fetchTechnicianRoster();
  return { data: data.find((tech) => tech.id === techId) ?? null, error };
}

export async function fetchVans(_userId: string) {
  return { data: [], error: null };
}

export async function fetchAssignedVan(_techId: string) {
  return { data: null, error: null };
}

export async function fetchTechDetails(_techId: string) {
  const empty = { data: [], error: null };
  return { skills: empty, payroll: empty, incidents: empty, onboarding: empty, leave: empty, appraisals: empty, docs: empty };
}

export async function fetchTeamOsTechnicianSnapshot(_fromDate: string, _toDate: string) {
  const { data, error } = await fetchTechnicianRoster();
  if (error) throw error;
  return data.map((tech) => ({
    technician_id: tech.id,
    workspace_user_id: tech.id,
    access_state: tech.is_active ? "linked" : "deactivated",
    employment_state: tech.is_active ? "active" : "inactive",
    field_status: tech.active_jobs > 0 ? "working" : "available",
    assigned_van_id: null,
    assigned_van_name: null,
    completed_jobs: tech.completed_today,
    collected_revenue: 0,
    productive_minutes: 0,
    available_minutes: 0,
    utilization: 0,
    active_skill_count: 0,
    expiring_skill_count: 0,
    compliance_issue_count: 0,
    onboarding_open_count: 0,
    current_job: null,
    next_job: null,
    data_fresh_at: new Date().toISOString(),
  }));
}

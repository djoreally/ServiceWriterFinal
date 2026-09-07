/** Mobile Dispatch Query — canonical appointment and technician-presence schema. */
import { supabase } from "@/integrations/supabase/client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";

function meta(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function getAuthUser() {
  const { data: { user } } = await getCurrentAuthUser();
  return user;
}

export async function fetchTechnicianRecord(userId: string) {
  const workspaceId = getSelectedWorkspaceId();
  if (!workspaceId) return { data: null, error: new Error("Select a workspace before loading technician state.") };
  const { data: member, error: memberError } = await supabase
    .from("workspace_members")
    .select("user_id,role,is_active")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  if (memberError || !member) return { data: null, error: memberError };
  const { data: presence, error: presenceError } = await supabase
    .from("technician_presence")
    .select("status,current_appointment_id,current_location,clocked_in_at,break_started_at")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (presenceError) return { data: null, error: presenceError };
  return {
    data: {
      id: userId,
      auth_user_id: userId,
      status: presence?.status ?? "offline",
      role: member.role,
      current_appointment_id: presence?.current_appointment_id ?? null,
      current_location: presence?.current_location ?? null,
      clocked_in_at: presence?.clocked_in_at ?? null,
      break_started_at: presence?.break_started_at ?? null,
    },
    error: null,
  };
}

export async function fetchActiveClockEntry(userId: string) {
  const workspaceId = getSelectedWorkspaceId();
  if (!workspaceId) return { data: [], error: new Error("Select a workspace before loading clock state.") };
  const { data, error } = await supabase
    .from("technician_presence")
    .select("user_id,clocked_in_at,status")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .not("clocked_in_at", "is", null)
    .limit(1);
  return { data: data ?? [], error };
}

export async function fetchTechnicianJobs(technicianId: string) {
  const workspaceId = getSelectedWorkspaceId();
  if (!workspaceId) return { data: [], error: new Error("Select a workspace before loading jobs.") };
  const db = supabase as any;
  const { data, error } = await db.from("appointments")
    .select("id,starts_at,ends_at,status,notes,metadata,customers(first_name,last_name,company_name,phone),vehicles(year,make,model,color,license_plate)")
    .eq("workspace_id", workspaceId)
    .eq("assigned_user_id", technicianId)
    .not("status", "in", '("completed","cancelled","no_show")')
    .order("starts_at");
  if (error) return { data: null, error };
  return {
    data: (data ?? []).map((row: any) => {
      const m = meta(row.metadata);
      const customer = row.customers;
      const name = customer?.company_name || [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || null;
      const duration = row.starts_at && row.ends_at ? Math.max(5, Math.round((Date.parse(row.ends_at) - Date.parse(row.starts_at)) / 60000)) : 60;
      return {
        ...row,
        scheduled_date: row.starts_at?.slice(0, 10) ?? null,
        scheduled_time: row.starts_at?.slice(11, 19) ?? null,
        estimated_duration_minutes: duration,
        dispatch_status: typeof m.dispatch_status === "string" ? m.dispatch_status : row.status,
        job_priority: typeof m.job_priority === "string" ? m.job_priority : "normal",
        actual_start_time: typeof m.actual_start_time === "string" ? m.actual_start_time : null,
        actual_end_time: typeof m.actual_end_time === "string" ? m.actual_end_time : null,
        customer: customer ? { name, phone: customer.phone ?? null, address: null } : null,
        vehicle: row.vehicles ?? null,
        service_catalog: { name: String(m.service_name ?? m.title ?? "Service") },
      };
    }),
    error: null,
  };
}

export function subscribeMobileDispatch(callback: () => void) {
  const channel = supabase.channel("mobile-dispatch").on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, callback).subscribe();
  return { channel, unsubscribe: () => supabase.removeChannel(channel) };
}

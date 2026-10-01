/** Mobile Dispatch Query — canonical appointment and technician-presence schema.
 *
 * Phase 2: data access goes through the typed API client
 * (`@/lib/api-client`) to the appointments Hono router. Exported signatures
 * are unchanged. Auth wiring (`getAuthUser`) and the realtime subscription
 * stay on the browser client.
 */
import { apiClient } from "@/lib/api-client";
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

type MobileDispatchState = {
  member: { user_id: string; role: string; is_active: boolean } | null;
  presence: {
    status: string; current_appointment_id: string | null; current_location: unknown;
    clocked_in_at: string | null; break_started_at: string | null;
  } | null;
  clock_entries: Array<{ user_id: string; clocked_in_at: string; status: string }>;
  jobs: any[];
};

async function fetchMobileDispatchState(userId: string): Promise<MobileDispatchState> {
  const workspaceId = getSelectedWorkspaceId();
  if (!workspaceId) throw new Error("Select a workspace before loading technician state.");
  const response = await apiClient.get<{ data: MobileDispatchState }>(
    "/v1/dispatch/mobile-dispatch-state",
    { query: { user_id: userId, selected_workspace_id: workspaceId } },
  );
  return response.data;
}

export async function fetchTechnicianRecord(userId: string) {
  const workspaceId = getSelectedWorkspaceId();
  if (!workspaceId) return { data: null, error: new Error("Select a workspace before loading technician state.") };
  try {
    const { member, presence } = await fetchMobileDispatchState(userId);
    if (!member) return { data: null, error: null };
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
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error("Failed to load technician state.") };
  }
}

export async function fetchActiveClockEntry(userId: string) {
  const workspaceId = getSelectedWorkspaceId();
  if (!workspaceId) return { data: [], error: new Error("Select a workspace before loading clock state.") };
  try {
    const { clock_entries } = await fetchMobileDispatchState(userId);
    return { data: clock_entries ?? [], error: null };
  } catch (error) {
    return { data: [], error: error instanceof Error ? error : new Error("Failed to load clock state.") };
  }
}

export async function fetchTechnicianJobs(technicianId: string) {
  const workspaceId = getSelectedWorkspaceId();
  if (!workspaceId) return { data: [], error: new Error("Select a workspace before loading jobs.") };
  try {
    const { jobs } = await fetchMobileDispatchState(technicianId);
    return {
      data: (jobs ?? []).map((row: any) => {
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
  } catch (error) {
    return { data: [], error: error instanceof Error ? error : new Error("Failed to load jobs.") };
  }
}

export function subscribeMobileDispatch(callback: () => void) {
  const channel = supabase.channel("mobile-dispatch").on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, callback).subscribe();
  return { channel, unsubscribe: () => supabase.removeChannel(channel) };
}

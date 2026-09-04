import { supabase } from "@/integrations/supabase/client";
import { withOperationTimeout } from "@/lib/operation-timeout";
import { withTransientRetry } from "@/lib/transient-backend";

const WORKFORCE_IDENTITY_TIMEOUT_MS = 2_500;

export type WorkforceRole = "admin" | "owner" | "manager" | "dispatcher" | "fleet_manager" | "technician" | "service_advisor" | "receptionist" | "viewer";
export interface WorkforceMembership { workspaceUserId: string; workspaceName: string; role: WorkforceRole; landingPath: string; isDefault: boolean; }
const map = (row: { workspace_user_id: string; workspace_name?: string; role: string; landing_path: string; is_default?: boolean }): WorkforceMembership => ({ workspaceUserId: row.workspace_user_id, workspaceName: row.workspace_name ?? "Service Writer workspace", role: row.role as WorkforceRole, landingPath: row.landing_path, isDefault: Boolean(row.is_default) });
export async function fetchWorkforceIdentity() {
  return withTransientRetry(async () => {
    const { data, error } = await withOperationTimeout(
      Promise.resolve(supabase.rpc("get_workforce_identity_v1")),
      WORKFORCE_IDENTITY_TIMEOUT_MS,
      "Workforce identity check timed out",
    );
    if (error) throw error;
    return (data ?? []).map(map);
  }, { attempts: 1 });
}
export async function selectActiveWorkspace(workspaceUserId: string, role: WorkforceRole) {
  return withTransientRetry(async () => {
    const { data, error } = await withOperationTimeout(
      Promise.resolve(supabase.rpc("select_active_workspace_v1", { p_owner_user_id: workspaceUserId, p_role: role })),
      WORKFORCE_IDENTITY_TIMEOUT_MS,
      "Workspace selection timed out",
    );
    if (error) throw error;
    if (!data?.[0]) throw new Error("The selected workspace is no longer available.");
    return map(data[0]);
  }, { attempts: 1 });
}

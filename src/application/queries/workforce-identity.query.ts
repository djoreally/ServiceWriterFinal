/**
 * Workforce identity queries.
 *
 * Phase 2: all data access goes through the typed API client
 * (`@/lib/api-client`) to the appointments Hono router
 * (`/v1/workforce-identity`), which attaches the session token automatically.
 * Exported signatures are unchanged.
 */
import { apiClient } from "@/lib/api-client";
import { withOperationTimeout } from "@/lib/operation-timeout";
import { withTransientRetry } from "@/lib/transient-backend";

const WORKFORCE_IDENTITY_TIMEOUT_MS = 5_000;

export type WorkforceRole = "admin" | "owner" | "manager" | "dispatcher" | "fleet_manager" | "technician" | "service_advisor" | "receptionist" | "viewer";
export interface WorkforceMembership { workspaceUserId: string; workspaceName: string; role: WorkforceRole; landingPath: string; isDefault: boolean; }

type WorkforceIdentityRow = {
  workspace_user_id: string;
  workspace_name?: string;
  role: string;
  landing_path: string;
  is_default?: boolean;
};

const map = (row: WorkforceIdentityRow): WorkforceMembership => ({
  workspaceUserId: row.workspace_user_id,
  workspaceName: row.workspace_name ?? "Service Writer workspace",
  role: row.role as WorkforceRole,
  landingPath: row.landing_path,
  isDefault: Boolean(row.is_default),
});

export async function fetchWorkforceIdentity() {
  return withTransientRetry(async () => {
    const response = await withOperationTimeout(
      apiClient.get<{ data: WorkforceIdentityRow[] }>("/v1/workforce-identity"),
      WORKFORCE_IDENTITY_TIMEOUT_MS,
      "Workforce identity check timed out",
    );
    return (response.data ?? []).map(map);
  }, { attempts: 2 });
}

export async function selectActiveWorkspace(workspaceUserId: string, role: WorkforceRole) {
  return withTransientRetry(async () => {
    const response = await withOperationTimeout(
      apiClient.post<{ data: WorkforceIdentityRow }>("/v1/workforce-identity", { workspaceUserId, role }),
      WORKFORCE_IDENTITY_TIMEOUT_MS,
      "Workspace selection timed out",
    );
    if (!response.data) throw new Error("Workspace identity response was incomplete.");
    return map(response.data);
  }, { attempts: 2 });
}

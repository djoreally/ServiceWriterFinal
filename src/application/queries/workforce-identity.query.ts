import { supabase } from "@/integrations/supabase/client";
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

async function apiRequest<T>(init?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Authentication session is unavailable. Please sign in again.");
  }

  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${session.access_token}`);
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const response = await fetch("/api/v1/workforce-identity", {
    ...init,
    credentials: "same-origin",
    headers,
  });

  const body = await response.json().catch(() => ({})) as {
    data?: T;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(body.error?.message || `Workspace identity request failed with HTTP ${response.status}`);
  }
  if (body.data === undefined) {
    throw new Error("Workspace identity response was incomplete.");
  }

  return body.data;
}

export async function fetchWorkforceIdentity() {
  return withTransientRetry(async () => {
    const data = await withOperationTimeout(
      apiRequest<WorkforceIdentityRow[]>(),
      WORKFORCE_IDENTITY_TIMEOUT_MS,
      "Workforce identity check timed out",
    );
    return data.map(map);
  }, { attempts: 2 });
}

export async function selectActiveWorkspace(workspaceUserId: string, role: WorkforceRole) {
  return withTransientRetry(async () => {
    const data = await withOperationTimeout(
      apiRequest<WorkforceIdentityRow>({
        method: "POST",
        body: JSON.stringify({ workspaceUserId, role }),
      }),
      WORKFORCE_IDENTITY_TIMEOUT_MS,
      "Workspace selection timed out",
    );
    return map(data);
  }, { attempts: 2 });
}

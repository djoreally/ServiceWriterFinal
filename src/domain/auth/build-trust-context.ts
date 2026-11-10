import { supabase } from "@/integrations/supabase/client";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";

export type TrustContext = {
  userId: string;
  orgId: string;
  role: "owner" | "manager" | "dispatcher" | "fleet_manager" | "technician" | "customer";
  permissions: string[];
  subscriptionTier?: string;
};

const ROLE_PERMISSIONS: Record<TrustContext["role"], string[]> = {
  owner: ["jobs.read", "jobs.write", "jobs.transition", "financials.read"],
  manager: ["jobs.read", "jobs.write", "jobs.transition", "financials.read"],
  dispatcher: ["jobs.read", "jobs.write", "jobs.transition"],
  fleet_manager: ["jobs.read", "jobs.write", "jobs.transition", "fleet.read", "fleet.write"],
  technician: ["jobs.read", "jobs.transition"],
  customer: ["jobs.read"],
};

function normalizeRole(raw: unknown): TrustContext["role"] {
  const key = String(raw || "").toLowerCase();
  if (key === "owner" || key === "tenant_owner" || key === "provider_owner") return "owner";
  if (key === "manager" || key === "tenant_staff") return "manager";
  if (key === "dispatcher") return "dispatcher";
  if (key === "fleet_manager" || key === "fleet-manager" || key === "fleet manager") return "fleet_manager";
  if (key === "technician") return "technician";
  return "customer";
}

export async function buildTrustContext(): Promise<TrustContext> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) throw new Error("Not authenticated");

  const role = normalizeRole(user.app_metadata?.role || user.user_metadata?.role);

  let subscriptionTier: string | undefined;
  // business_subscriptions is workspace-keyed after the Step 3
  // translation. NEED-7 source, named: the client's selected-workspace
  // store — getSelectedWorkspaceId from workspaces.selection, the same
  // selection the server resolvers accept as the selected_workspace_id
  // hint. The lookup stays ONE round trip, exactly like the user_id
  // read it replaces: membership is enforced through the workspaces
  // embed (!inner at both levels), the selected workspace narrows the
  // filter when one is set, and the latest active row wins. (Resolving
  // the workspace in a separate call first — via settings.query's
  // API-backed resolveCurrentWorkspace or a workspace_members pre-read
  // — was measured adding ~5 s to cold render paths that build a trust
  // context, so it is deliberately NOT done here.) orgId below stays
  // the user id — the TrustContext contract is out of this step's scope.
  let subQuery = (supabase as any)
    .from("business_subscriptions")
    .select("status, plan_id, platform_plans(name), workspaces!inner(workspace_members!inner(user_id))")
    .eq("status", "active")
    .eq("workspaces.workspace_members.user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1);
  const selectedWorkspaceId = getSelectedWorkspaceId();
  if (selectedWorkspaceId) {
    subQuery = subQuery.eq("workspace_id", selectedWorkspaceId);
  }
  const { data: subs } = await subQuery;
  const sub = (subs as Array<{ plan_id?: string | null; platform_plans?: { name?: string } | null }> | null)?.[0];
  if (sub?.platform_plans?.name) {
    subscriptionTier = String(sub.platform_plans.name);
  } else if (sub?.plan_id) {
    subscriptionTier = String(sub.plan_id);
  }

  return {
    userId: user.id,
    orgId: user.id,
    role,
    permissions: ROLE_PERMISSIONS[role],
    subscriptionTier,
  };
}

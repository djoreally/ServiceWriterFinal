import { errorResponse, json } from "@/server/api";
import { ensureWorkspaceBilling, resolveAuthorizedBillingWorkspace } from "@/server/billing/workspace-billing";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspace_id");
    const { admin, workspace } = await resolveAuthorizedBillingWorkspace(request, workspaceId);
    const billing = await ensureWorkspaceBilling(admin, workspace.id);

    const { data: entitlement, error } = await admin.rpc("get_workspace_billing_v1", {
      p_workspace_id: workspace.id,
    });
    if (error) throw error;

    return json({
      workspace: { id: workspace.id, name: workspace.name },
      billing,
      entitlements: entitlement?.[0] ?? null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

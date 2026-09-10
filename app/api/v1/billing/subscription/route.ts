import { errorResponse, json } from "@/server/api";
import { ensureWorkspaceBilling, resolveAuthorizedBillingWorkspace } from "@/server/billing/workspace-billing";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspace_id");
    const { admin, workspace } = await resolveAuthorizedBillingWorkspace(request, workspaceId);
    const billing = await ensureWorkspaceBilling(admin, workspace.id);

    const [{ data: entitlement, error: entitlementError }, technicianCount] = await Promise.all([
      admin.rpc("get_workspace_billing_v1", { p_workspace_id: workspace.id }),
      admin
        .from("workspace_members")
        .select("user_id", { count: "exact", head: true })
        .eq("workspace_id", workspace.id)
        .eq("role", "technician")
        .eq("is_active", true),
    ]);
    if (entitlementError) throw entitlementError;
    if (technicianCount.error) throw technicianCount.error;

    const entitlements = entitlement?.[0] ?? null;
    const technician_count = technicianCount.count ?? 0;
    const technician_limit = entitlements?.entitled_technicians ?? 0;

    return json({
      workspace: { id: workspace.id, name: workspace.name },
      billing,
      entitlements,
      usage: {
        technician_count,
        technicians_remaining: Math.max(0, technician_limit - technician_count),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

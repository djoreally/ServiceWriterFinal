/** Customer Segmentation Commands — workspace-scoped writes and recalculation. */
import { apiClient } from "@/lib/api-client";
import type { SegmentRow } from "@/application/queries/customer-segmentation.query";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import { getCurrentAuthUser } from "@/lib/auth/current-user";

async function requireContext() {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");
  const workspace = await resolveCurrentWorkspace();
  if (!workspace) throw new Error("No active workspace is available.");
  return { userId: user.id, workspaceId: workspace.workspaceId };
}

export async function saveSegment(_userId: string, segment: Partial<SegmentRow>, isEdit: boolean) {
  const { workspaceId } = await requireContext();
  await apiClient.post("/v1/crm/segments", {
    ...segment,
    is_edit: isEdit,
    workspace_id: workspaceId,
  });
}

export async function deleteSegment(segmentId: string) {
  const { workspaceId } = await requireContext();
  await apiClient.delete(`/v1/crm/segments/${segmentId}`, {
    query: { workspace_id: workspaceId },
  });
}

export async function recalculateAllCustomers(): Promise<number> {
  const { workspaceId } = await requireContext();
  const { data } = await apiClient.post<{ data: { recalculated: number } }>("/v1/crm/segments/recalculate", {
    workspace_id: workspaceId,
  });
  return data?.recalculated ?? 0;
}

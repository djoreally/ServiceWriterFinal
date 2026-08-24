/** Service Records Commands — canonical write operations. */
import { nextApi } from "@/lib/nextApiClient";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";

/** Void a service record while preserving its audit history. */
export async function deleteServiceRecord(id: string, _reason?: string): Promise<void> {
  const workspaceId = getSelectedWorkspaceId();
  if (!workspaceId) throw new Error("Select a workspace before voiding a service record.");
  await nextApi.serviceRecords.remove(workspaceId, id);
}

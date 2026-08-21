import { nextApi, type WorkspaceMembership } from "@/lib/nextApiClient";

export {
  clearSelectedWorkspaceId,
  getSelectedWorkspaceId,
  resolveSelectedWorkspace,
  setSelectedWorkspaceId,
} from "@/application/queries/workspaces.selection";

export async function listWorkspaceMemberships(): Promise<WorkspaceMembership[]> {
  return nextApi.workspaces();
}

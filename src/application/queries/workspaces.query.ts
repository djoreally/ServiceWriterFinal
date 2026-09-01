import { nextApi, type WorkspaceMembership } from "@/lib/nextApiClient";

export {
  clearSelectedWorkspaceId,
  getSelectedWorkspaceId,
  resolveSelectedWorkspace,
  setSelectedWorkspaceId,
} from "@/application/queries/workspaces.selection";

const WORKSPACE_MEMBERSHIP_TTL_MS = 5 * 60 * 1000;
let membershipCache: { value: WorkspaceMembership[]; expiresAt: number } | null = null;
let membershipInFlight: Promise<WorkspaceMembership[]> | null = null;

/**
 * Workspace memberships are shell-level identity data. Multiple mounted
 * consumers (header + page) should share one request instead of each calling
 * /api/v1/workspaces independently during navigation.
 */
export async function listWorkspaceMemberships(options: { force?: boolean } = {}): Promise<WorkspaceMembership[]> {
  const now = Date.now();
  if (!options.force && membershipCache && membershipCache.expiresAt > now) {
    return membershipCache.value;
  }

  if (!options.force && membershipInFlight) return membershipInFlight;

  const request = nextApi.workspaces()
    .then((memberships) => {
      membershipCache = {
        value: memberships,
        expiresAt: Date.now() + WORKSPACE_MEMBERSHIP_TTL_MS,
      };
      return memberships;
    })
    .finally(() => {
      if (membershipInFlight === request) membershipInFlight = null;
    });

  membershipInFlight = request;
  return request;
}

export function resetWorkspaceMembershipCache(): void {
  membershipCache = null;
  membershipInFlight = null;
}

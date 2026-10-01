import { z } from "zod";
import { apiClient, ApiClientError } from "@/lib/api-client";

const workspaceMembershipSchema = z.object({
  workspace_id: z.string().uuid(),
  role: z.string().min(1),
  is_active: z.boolean(),
  workspaces: z.object({
    id: z.string().uuid(),
    name: z.string().min(1),
    slug: z.string().min(1),
    kind: z.string().min(1),
    timezone: z.string().min(1),
    currency_code: z.string().min(1),
    is_active: z.boolean(),
  }).nullable(),
});

export type WorkspaceMembership = z.infer<typeof workspaceMembershipSchema>;

export {
  clearSelectedWorkspaceId,
  getSelectedWorkspaceId,
  resolveSelectedWorkspace,
  setSelectedWorkspaceId,
} from "@/application/queries/workspaces.selection";

const WORKSPACE_MEMBERSHIP_TTL_MS = 5 * 60 * 1000;
let membershipCache: { value: WorkspaceMembership[]; expiresAt: number } | null = null;
let membershipInFlight: Promise<WorkspaceMembership[]> | null = null;

async function fetchWorkspaceMemberships(): Promise<WorkspaceMembership[]> {
  const response = await apiClient.get<{ data: unknown[] }>("/v1/workspaces");
  const parsed = z.array(workspaceMembershipSchema).safeParse(response.data);
  if (!parsed.success) throw new ApiClientError(502, "invalid_api_response", "Workspace response was invalid");
  return parsed.data;
}

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

  const request = fetchWorkspaceMemberships()
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

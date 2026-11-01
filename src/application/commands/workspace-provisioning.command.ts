/**
 * Workspace provisioning command — self-serve owner signup (P0-1).
 *
 * Calls the session-authenticated Hono route, which invokes the
 * SECURITY DEFINER RPC `provision_owner_workspace_v1` with the caller's
 * own session (the same route → RPC shape as invitation acceptance).
 * The RPC is idempotent: it creates the workspace, owner membership,
 * and Basic Free billing row exactly once per owner, and records the
 * Terms/Privacy acceptance for the versions in `@/lib/legal`.
 */
import { apiClient } from "@/lib/api-client";
import { PRIVACY_POLICY_VERSION, TERMS_OF_SERVICE_VERSION } from "@/lib/legal";

export interface ProvisionOwnerWorkspaceResult {
  workspaceId: string;
  slug: string;
  /** False when the account already owned a workspace and nothing was created. */
  created: boolean;
}

interface ProvisionOwnerWorkspaceResponse {
  workspace_id?: string;
  slug?: string;
  created?: boolean;
}

export async function provisionOwnerWorkspace(businessName: string): Promise<ProvisionOwnerWorkspaceResult> {
  const timezone = typeof Intl !== "undefined"
    ? Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
    : undefined;

  const response = await apiClient.post<{ data: ProvisionOwnerWorkspaceResponse }>(
    "/v1/platform/workspaces/provision-owner",
    {
      businessName: businessName.trim(),
      timezone,
      termsVersion: TERMS_OF_SERVICE_VERSION,
      privacyVersion: PRIVACY_POLICY_VERSION,
    },
  );

  const data = response.data;
  if (!data?.workspace_id) {
    throw new Error("Workspace provisioning response was incomplete.");
  }

  return {
    workspaceId: data.workspace_id,
    slug: data.slug ?? "",
    created: Boolean(data.created),
  };
}

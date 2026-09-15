import { createSupabaseServerClient } from "@/lib/supabase";

export interface WorkspaceAuthContext {
  userId: string;
  workspaceId: string;
  role: string;
}

/**
 * Asserts that the authenticated user is an active member of the target workspace.
 * Throws an error if unauthorized, preventing cross-tenant access.
 */
export async function assertWorkspaceAccess(targetWorkspaceId: string): Promise<WorkspaceAuthContext> {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("UNAUTHORIZED: Authentication required");
  }

  const { data: membership, error: memberError } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, status")
    .eq("workspace_id", targetWorkspaceId)
    .eq("user_id", user.id)
    .single();

  if (memberError || !membership) {
    throw new Error("FORBIDDEN: User does not belong to the specified workspace");
  }

  if (membership.status && membership.status !== "active") {
    throw new Error("FORBIDDEN: User workspace membership is inactive");
  }

  return {
    userId: user.id,
    workspaceId: membership.workspace_id,
    role: membership.role,
  };
}

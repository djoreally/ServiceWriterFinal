/**
 * Email Testing Commands — send authenticated transactional test emails.
 */
import { apiClient } from "@/lib/api-client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export async function invokeSendTestEmail(body: Record<string, unknown>) {
  try {
    const workspace = await resolveCurrentWorkspace();
    if (!workspace) return { data: null, error: new Error("No active workspace") };

    const data = await apiClient.post<unknown>("/v1/email-testing/send", {
      ...body,
      selected_workspace_id: workspace.workspaceId,
    });
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error("Test email failed") };
  }
}

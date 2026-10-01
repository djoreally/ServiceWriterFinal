/** Retention Commands — canonical loyalty writes plus automation rules. */
import { apiClient } from "@/lib/api-client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

async function loyaltyWorkspaceId(): Promise<string> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("No active workspace is available.");
  return context.workspaceId;
}

export async function deleteLoyaltyProgram(id: string) {
  const workspaceId = await loyaltyWorkspaceId();
  await apiClient.delete(`/v1/crm/loyalty/programs/${id}`, {
    query: { workspace_id: workspaceId },
  });
}

export async function deleteLoyaltyReward(id: string) {
  const workspaceId = await loyaltyWorkspaceId();
  await apiClient.delete(`/v1/crm/loyalty/rewards/${id}`, {
    query: { workspace_id: workspaceId },
  });
}

export async function toggleAutomationRule(ruleId: string, currentActive: boolean) {
  await apiClient.patch(`/v1/crm/retention/automation-rules/${ruleId}`, {
    is_active: !currentActive,
  });
}

export async function deleteAutomationRule(ruleId: string) {
  await apiClient.delete(`/v1/crm/retention/automation-rules/${ruleId}`);
}

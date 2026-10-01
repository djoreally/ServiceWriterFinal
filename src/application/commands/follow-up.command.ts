/** Follow-Up Commands — workspace-scoped writes. */
import { apiClient } from "@/lib/api-client";
import type { FollowUpRule } from "@/application/queries/follow-up.query";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

async function requireContext() {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");
  const workspace = await resolveCurrentWorkspace();
  if (!workspace) throw new Error("No active workspace is available.");
  return { userId: user.id, workspaceId: workspace.workspaceId };
}

export async function seedDefaultFollowUpRules(_userId: string): Promise<void> {
  const { workspaceId } = await requireContext();
  await apiClient.post("/v1/crm/follow-up/rules/seed-defaults", {
    workspace_id: workspaceId,
  });
}

function validateRule(rule: Partial<FollowUpRule>) {
  if (!rule.name?.trim() || !rule.trigger_type || !rule.action_type) throw new Error("Follow-up rule is missing required fields");
  if (rule.action_type === "email" && (!rule.email_subject?.trim() || !rule.email_content?.trim())) throw new Error("Email automations require a subject and message");
  if (rule.action_type === "sms" && (!rule.sms_content?.trim() || rule.sms_content.trim().length > 1600)) throw new Error("SMS automations require a message no longer than 1600 characters");
  if (rule.action_type === "task" && !rule.task_title?.trim()) throw new Error("Task automations require a task title");
}

export async function saveFollowUpRule(rule: Partial<FollowUpRule>, isUpdate: boolean): Promise<void> {
  validateRule(rule);
  const { workspaceId } = await requireContext();
  await apiClient.post("/v1/crm/follow-up/rules", {
    ...rule,
    is_edit: isUpdate,
    workspace_id: workspaceId,
  });
}

export async function toggleFollowUpRule(ruleId: string, currentActive: boolean): Promise<void> {
  const { workspaceId } = await requireContext();
  await apiClient.patch(`/v1/crm/follow-up/rules/${ruleId}`, {
    workspace_id: workspaceId,
    is_active: !currentActive,
  });
}

export async function deleteFollowUpRule(ruleId: string): Promise<void> {
  const { workspaceId } = await requireContext();
  await apiClient.delete(`/v1/crm/follow-up/rules/${ruleId}`, {
    query: { workspace_id: workspaceId },
  });
}

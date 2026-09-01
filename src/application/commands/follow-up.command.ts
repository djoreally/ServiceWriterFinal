/** Follow-Up Commands — workspace-scoped writes. */
import { productionSupabase } from "@/integrations/supabase/client";
import type { FollowUpRule } from "@/application/queries/follow-up.query";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
const db = productionSupabase as any;

async function requireContext() {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");
  const workspace = await resolveCurrentWorkspace();
  if (!workspace) throw new Error("No active workspace is available.");
  return { userId: user.id, workspaceId: workspace.workspaceId };
}

export async function seedDefaultFollowUpRules(_userId: string): Promise<void> {
  const { userId, workspaceId } = await requireContext();
  const defaults = [
    { name: "Declined Service Follow-Up", description: "Follow up after a customer declines recommended work.", trigger_type: "declined_service", trigger_days: 7, action_type: "email", email_subject: "A quick follow-up on your recommended service", email_content: "We wanted to follow up on the service recommendation from your recent visit.", preset_key: "declined_service_7d" },
    { name: "Service Thank You", description: "Thank customers after completed service.", trigger_type: "service_completed", trigger_days: 1, action_type: "email", email_subject: "Thanks for choosing us", email_content: "Thank you for trusting us with your vehicle service.", preset_key: "service_thank_you" },
    { name: "90-Day Inactivity", description: "Reconnect with customers who have not serviced recently.", trigger_type: "inactivity", trigger_days: 90, action_type: "email", email_subject: "Is your vehicle due for service?", email_content: "It may be time to schedule your next maintenance visit.", preset_key: "inactivity_90d" },
  ];
  for (const rule of defaults) {
    const { error } = await db.from("follow_up_rules").upsert({ ...rule, workspace_id: workspaceId, user_id: userId, is_active: true }, { onConflict: "workspace_id,name", ignoreDuplicates: true });
    if (error) throw error;
  }
}

function validateRule(rule: Partial<FollowUpRule>) {
  if (!rule.name?.trim() || !rule.trigger_type || !rule.action_type) throw new Error("Follow-up rule is missing required fields");
  if (rule.action_type === "email" && (!rule.email_subject?.trim() || !rule.email_content?.trim())) throw new Error("Email automations require a subject and message");
  if (rule.action_type === "sms" && (!rule.sms_content?.trim() || rule.sms_content.trim().length > 1600)) throw new Error("SMS automations require a message no longer than 1600 characters");
  if (rule.action_type === "task" && !rule.task_title?.trim()) throw new Error("Task automations require a task title");
}

export async function saveFollowUpRule(rule: Partial<FollowUpRule>, isUpdate: boolean): Promise<void> {
  validateRule(rule);
  const { userId, workspaceId } = await requireContext();
  const payload = {
    ...rule,
    id: undefined,
    workspace_id: workspaceId,
    user_id: userId,
    trigger_days: Number.isFinite(Number(rule.trigger_days)) ? Math.max(0, Math.min(365, Number(rule.trigger_days))) : 0,
    updated_at: new Date().toISOString(),
  };
  if (isUpdate && rule.id) {
    const { error } = await db.from("follow_up_rules").update(payload).eq("workspace_id", workspaceId).eq("id", rule.id);
    if (error) throw error;
  } else {
    const { error } = await db.from("follow_up_rules").insert(payload);
    if (error) throw error;
  }
}

export async function toggleFollowUpRule(ruleId: string, currentActive: boolean): Promise<void> {
  const { workspaceId } = await requireContext();
  const { error } = await db.from("follow_up_rules").update({ is_active: !currentActive, updated_at: new Date().toISOString() }).eq("workspace_id", workspaceId).eq("id", ruleId);
  if (error) throw error;
}

export async function deleteFollowUpRule(ruleId: string): Promise<void> {
  const { workspaceId } = await requireContext();
  const { error } = await db.from("follow_up_rules").delete().eq("workspace_id", workspaceId).eq("id", ruleId);
  if (error) throw error;
}

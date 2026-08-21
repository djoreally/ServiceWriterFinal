/**
 * Follow-Up Commands — Write operations for follow-up rules.
 */
import { supabase } from "@/integrations/supabase/client";
import type { FollowUpRule } from "@/application/queries/follow-up.query";
import type { Database } from "@/integrations/supabase/types";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export async function seedDefaultFollowUpRules(userId: string): Promise<void> {
  const { error } = await supabase.rpc("seed_default_follow_up_rules", {
    p_user_id: userId,
  });
  if (error) throw error;
}

type FollowUpRuleInsert = Database["public"]["Tables"]["follow_up_rules"]["Insert"];

function toFollowUpRuleInsert(rule: Partial<FollowUpRule>, userId: string): FollowUpRuleInsert {
  if (!rule.name?.trim() || !rule.trigger_type || !rule.action_type) {
    throw new Error("Follow-up rule is missing required fields");
  }
  const triggerDays = Number.isFinite(Number(rule.trigger_days)) ? Math.max(0, Math.min(365, Number(rule.trigger_days))) : 0;
  if (rule.action_type === "email" && (!rule.email_subject?.trim() || !rule.email_content?.trim())) {
    throw new Error("Email automations require a subject and message");
  }
  if (rule.action_type === "sms" && (!rule.sms_content?.trim() || rule.sms_content.trim().length > 1600)) {
    throw new Error("SMS automations require a message no longer than 1600 characters");
  }
  if (rule.action_type === "task" && !rule.task_title?.trim()) {
    throw new Error("Task automations require a task title");
  }

  return {
    ...rule,
    name: rule.name,
    trigger_type: rule.trigger_type,
    trigger_days: triggerDays,
    action_type: rule.action_type,
    user_id: userId,
  };
}

export async function saveFollowUpRule(rule: Partial<FollowUpRule>, isUpdate: boolean): Promise<void> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");

  const ruleData = toFollowUpRuleInsert(rule, user.id);

  if (isUpdate && rule.id) {
    const { error } = await supabase
      .from("follow_up_rules")
      .update(ruleData)
      .eq("id", rule.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("follow_up_rules")
      .insert([ruleData]);
    if (error) throw error;
  }
}

export async function toggleFollowUpRule(ruleId: string, currentActive: boolean): Promise<void> {
  const { error } = await supabase
    .from("follow_up_rules")
    .update({ is_active: !currentActive })
    .eq("id", ruleId);
  if (error) throw error;
}

export async function deleteFollowUpRule(ruleId: string): Promise<void> {
  const { error } = await supabase.rpc("soft_delete_follow_up_rule", {
    _rule_id: ruleId,
    _reason: "Deleted from Follow-Up Automation",
  });
  if (error) throw error;
}

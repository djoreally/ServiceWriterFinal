/** Retention Commands — canonical loyalty writes plus automation rules. */
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

async function loyaltyWorkspaceId(): Promise<string> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("No active workspace is available.");
  return context.workspaceId;
}

export async function deleteLoyaltyProgram(id: string) {
  const workspaceId = await loyaltyWorkspaceId();
  const { error } = await (supabase as any).from("crm_loyalty_programs").delete().eq("workspace_id", workspaceId).eq("id", id);
  if (error) throw error;
}

export async function deleteLoyaltyReward(id: string) {
  const workspaceId = await loyaltyWorkspaceId();
  const { error } = await (supabase as any).from("crm_loyalty_rewards").delete().eq("workspace_id", workspaceId).eq("id", id);
  if (error) throw error;
}

export async function toggleAutomationRule(ruleId: string, currentActive: boolean) {
  const { error } = await supabase.from("automation_rules").update({ is_active: !currentActive }).eq("id", ruleId);
  if (error) throw error;
}

export async function deleteAutomationRule(ruleId: string) {
  const { error } = await supabase.from("automation_rules").delete().eq("id", ruleId);
  if (error) throw error;
}

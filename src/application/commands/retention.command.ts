/**
 * Retention Commands — Write operations for loyalty programs and automation rules.
 */
import { supabase } from "@/integrations/supabase/client";

export async function deleteLoyaltyProgram(id: string) {
  const { error } = await supabase.from("loyalty_programs").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteLoyaltyReward(id: string) {
  const { error } = await supabase.from("loyalty_rewards").delete().eq("id", id);
  if (error) throw error;
}

export async function toggleAutomationRule(ruleId: string, currentActive: boolean) {
  const { error } = await supabase
    .from("automation_rules")
    .update({ is_active: !currentActive })
    .eq("id", ruleId);
  if (error) throw error;
}

export async function deleteAutomationRule(ruleId: string) {
  const { error } = await supabase.from("automation_rules").delete().eq("id", ruleId);
  if (error) throw error;
}

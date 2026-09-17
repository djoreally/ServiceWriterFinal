/** Loyalty Template Commands - seed canonical CRM loyalty programs + rewards. */
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import { getTemplateById, type LoyaltyTemplate } from "@/lib/retention/loyalty-templates";

export interface SeedTemplateResult { programId: string; rewardsInserted: number; }

export async function seedLoyaltyTemplate(_userId: string, templateId: string): Promise<SeedTemplateResult> {
  const template: LoyaltyTemplate | undefined = getTemplateById(templateId);
  if (!template) throw new Error(`Unknown loyalty template: ${templateId}`);
  const workspace = await resolveCurrentWorkspace();
  if (!workspace) throw new Error("No active workspace is available.");
  const db = supabase as any;

  const { data: programId, error: programError } = await db.rpc("save_loyalty_program_v1", {
    p_workspace_id: workspace.workspaceId,
    p_name: template.name,
    p_scope: template.scope,
    p_status: "active",
    p_points_per_dollar: template.pointsPerDollar,
    p_points_per_visit: template.pointsPerVisit,
    p_program_id: null,
  });
  if (programError || !programId) throw new Error(programError?.message || "Failed to create program from template");

  let inserted = 0;
  try {
    for (const reward of template.rewards) {
      const configKey = reward.rewardType.includes("discount") ? "value" : "amount";
      const config = reward.configValue !== null ? { [configKey]: reward.configValue } : {};
      const { error } = await db.rpc("save_loyalty_reward_v1", {
        p_workspace_id: workspace.workspaceId,
        p_program_id: programId,
        p_name: reward.name,
        p_description: reward.description,
        p_points_required: reward.pointsRequired,
        p_reward_type: reward.rewardType,
        p_config: config,
        p_reward_id: null,
      });
      if (error) throw error;
      inserted += 1;
    }
  } catch (error) {
    await db.from("crm_loyalty_programs").delete().eq("workspace_id", workspace.workspaceId).eq("id", programId);
    throw error;
  }

  return { programId: String(programId), rewardsInserted: inserted };
}

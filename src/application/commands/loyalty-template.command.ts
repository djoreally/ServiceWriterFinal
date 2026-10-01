/** Loyalty Template Commands - seed canonical CRM loyalty programs + rewards. */
import { apiClient } from "@/lib/api-client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import { getTemplateById, type LoyaltyTemplate } from "@/lib/retention/loyalty-templates";

export interface SeedTemplateResult { programId: string; rewardsInserted: number; }

export async function seedLoyaltyTemplate(_userId: string, templateId: string): Promise<SeedTemplateResult> {
  const template: LoyaltyTemplate | undefined = getTemplateById(templateId);
  if (!template) throw new Error(`Unknown loyalty template: ${templateId}`);
  const workspace = await resolveCurrentWorkspace();
  if (!workspace) throw new Error("No active workspace is available.");

  const { data } = await apiClient.post<{ data: SeedTemplateResult }>("/v1/crm/loyalty/templates/seed", {
    workspace_id: workspace.workspaceId,
    program: {
      name: template.name,
      scope: template.scope,
      points_per_dollar: template.pointsPerDollar,
      points_per_visit: template.pointsPerVisit,
    },
    rewards: template.rewards.map((reward) => {
      const configKey = reward.rewardType.includes("discount") ? "value" : "amount";
      return {
        name: reward.name,
        description: reward.description,
        points_required: reward.pointsRequired,
        reward_type: reward.rewardType,
        config: reward.configValue !== null ? { [configKey]: reward.configValue } : {},
      };
    }),
  });
  return data;
}

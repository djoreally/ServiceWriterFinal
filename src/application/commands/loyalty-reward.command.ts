/** Loyalty Reward Commands - canonical workspace-scoped CRM loyalty writes. */
import { apiClient } from "@/lib/api-client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface LoyaltyRewardPayload {
  userId: string;
  programId: string;
  name: string;
  description: string | null;
  pointsRequired: number;
  rewardType: string;
  configValue: string;
}

export async function saveLoyaltyReward(payload: LoyaltyRewardPayload, editId?: string): Promise<void> {
  const workspace = await resolveCurrentWorkspace();
  if (!workspace) throw new Error("No active workspace is available.");
  const configKey = payload.rewardType.includes("discount") ? "value" : "amount";
  const config = payload.configValue ? { [configKey]: Number.parseFloat(payload.configValue) } : {};
  await apiClient.post("/v1/crm/loyalty/rewards", {
    workspace_id: workspace.workspaceId,
    program_id: payload.programId,
    name: payload.name,
    description: payload.description,
    points_required: payload.pointsRequired,
    reward_type: payload.rewardType,
    config,
    reward_id: editId ?? null,
  });
}

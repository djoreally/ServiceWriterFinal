/** Loyalty Reward Commands - canonical workspace-scoped CRM loyalty writes. */
import { supabase } from "@/integrations/supabase/client";
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
  const { error } = await (supabase as any).rpc("save_loyalty_reward_v1", {
    p_workspace_id: workspace.workspaceId,
    p_program_id: payload.programId,
    p_name: payload.name,
    p_description: payload.description,
    p_points_required: Math.max(1, payload.pointsRequired),
    p_reward_type: payload.rewardType,
    p_config: config,
    p_reward_id: editId ?? null,
  });
  if (error) throw error;
}

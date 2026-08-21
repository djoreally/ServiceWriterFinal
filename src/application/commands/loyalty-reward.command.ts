/**
 * Loyalty Reward Commands
 * Handles creating/updating loyalty reward items.
 */

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

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
  const configKey = payload.rewardType.includes("discount") ? "value" : "amount";
  const dbPayload = {
    user_id: payload.userId,
    program_id: payload.programId,
    name: payload.name,
    description: payload.description,
    points_required: payload.pointsRequired,
    reward_type: payload.rewardType as "credit" | "free_service" | "discount_percent" | "discount_fixed" | "priority_booking",
    config_jsonb: payload.configValue ? ({ [configKey]: parseFloat(payload.configValue) } as Json) : null,
    status: "active",
  };

  const query = editId
    ? supabase.from("loyalty_rewards").update(dbPayload).eq("id", editId)
    : supabase.from("loyalty_rewards").insert(dbPayload);

  const { error } = await query;
  if (error) throw new Error("Failed to save reward");
}

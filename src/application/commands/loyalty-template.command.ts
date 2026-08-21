/**
 * Loyalty Template Commands - Seed preconfigured loyalty programs + rewards atomically.
 */

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { getTemplateById, type LoyaltyTemplate } from "@/lib/retention/loyalty-templates";

export interface SeedTemplateResult {
  programId: string;
  rewardsInserted: number;
}

/**
 * Seeds a loyalty template — inserts the program then all rewards.
 * If reward inserts fail, the program is rolled back (deleted) to keep state clean.
 */
export async function seedLoyaltyTemplate(
  userId: string,
  templateId: string,
): Promise<SeedTemplateResult> {
  const template: LoyaltyTemplate | undefined = getTemplateById(templateId);
  if (!template) throw new Error(`Unknown loyalty template: ${templateId}`);

  // 1. Insert program
  const programRecord = {
    user_id: userId,
    name: template.name,
    scope: template.scope,
    status: "active",
    earn_rules_jsonb: {
      points_per_dollar: template.pointsPerDollar,
      points_per_visit: template.pointsPerVisit,
    } as Json,
  };

  const { data: program, error: programError } = await supabase
    .from("loyalty_programs")
    .insert(programRecord)
    .select("id")
    .single();

  if (programError || !program) {
    throw new Error(programError?.message || "Failed to create program from template");
  }

  // 2. Insert rewards
  const rewardRecords = template.rewards.map((r) => {
    const configKey = r.rewardType.includes("discount") ? "value" : "amount";
    const configJsonb =
      r.configValue !== null ? ({ [configKey]: r.configValue } as Json) : null;
    return {
      user_id: userId,
      program_id: program.id,
      name: r.name,
      description: r.description,
      points_required: r.pointsRequired,
      reward_type: r.rewardType,
      config_jsonb: configJsonb,
      status: "active" as const,
    };
  });

  const { error: rewardsError, count } = await supabase
    .from("loyalty_rewards")
    .insert(rewardRecords, { count: "exact" });

  if (rewardsError) {
    // Rollback program insert
    await supabase.from("loyalty_programs").delete().eq("id", program.id);
    throw new Error(`Failed to seed rewards: ${rewardsError.message}`);
  }

  return {
    programId: program.id,
    rewardsInserted: count ?? rewardRecords.length,
  };
}

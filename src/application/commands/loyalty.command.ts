/**
 * Loyalty Program Commands - Write operations for loyalty programs.
 */

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export interface LoyaltyProgramPayload {
  name: string;
  scope: string;
  status: string;
  pointsPerDollar: number;
  pointsPerVisit: number;
}

/**
 * Save (create or update) a loyalty program.
 */
export async function saveLoyaltyProgram(
  userId: string,
  payload: LoyaltyProgramPayload,
  existingId?: string,
): Promise<void> {
  const record = {
    user_id: userId,
    name: payload.name,
    scope: payload.scope,
    status: payload.status,
    earn_rules_jsonb: {
      points_per_dollar: payload.pointsPerDollar,
      points_per_visit: payload.pointsPerVisit,
    } as Json,
  };

  if (existingId) {
    const { error } = await supabase
      .from("loyalty_programs")
      .update(record)
      .eq("id", existingId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("loyalty_programs")
      .insert(record);
    if (error) throw error;
  }
}

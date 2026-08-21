/**
 * Dispatch Settings Commands — All write operations for dispatch algorithm config.
 * Extracted from dispatch-settings.query.ts to enforce command/query separation.
 */
import { supabase } from "@/integrations/supabase/client";
import type { DispatchConfig } from "@/application/queries/dispatch-settings.query";

export async function toggleAutoDispatch(userId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from("business_profiles")
    .update({ auto_dispatch_enabled: enabled })
    .eq("user_id", userId);
  if (error) throw error;
}

export async function saveDispatchWeights(userId: string, config: DispatchConfig): Promise<void> {
  const { error } = await supabase
    .from("business_profiles")
    .update({
      dispatch_weight_distance: config.dispatch_weight_distance / 100,
      dispatch_weight_load: config.dispatch_weight_load / 100,
      dispatch_weight_performance: config.dispatch_weight_performance / 100,
      dispatch_weight_fairness: config.dispatch_weight_fairness / 100,
      dispatch_weight_route: config.dispatch_weight_route / 100,
      dispatch_fleet_performance_threshold: config.dispatch_fleet_performance_threshold,
    })
    .eq("user_id", userId);
  if (error) throw error;
}

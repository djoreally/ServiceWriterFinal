/**
 * Dispatch Settings Query — Read-only data access for dispatch algorithm config.
 * All write operations have been moved to dispatch-settings.command.ts.
 */
import { supabase } from "@/integrations/supabase/client";

export interface DispatchConfig {
  auto_dispatch_enabled: boolean;
  dispatch_weight_distance: number;
  dispatch_weight_load: number;
  dispatch_weight_performance: number;
  dispatch_weight_fairness: number;
  dispatch_weight_route: number;
  dispatch_fleet_performance_threshold: number;
}

export async function fetchDispatchConfig(userId: string): Promise<DispatchConfig | null> {
  const { data } = await supabase
    .from("business_profiles")
    .select("auto_dispatch_enabled, dispatch_weight_distance, dispatch_weight_load, dispatch_weight_performance, dispatch_weight_fairness, dispatch_weight_route, dispatch_fleet_performance_threshold")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return null;

  return {
    auto_dispatch_enabled: data.auto_dispatch_enabled ?? false,
    dispatch_weight_distance: Math.round((data.dispatch_weight_distance ?? 0.30) * 100),
    dispatch_weight_load: Math.round((data.dispatch_weight_load ?? 0.20) * 100),
    dispatch_weight_performance: Math.round((data.dispatch_weight_performance ?? 0.20) * 100),
    dispatch_weight_fairness: Math.round((data.dispatch_weight_fairness ?? 0.15) * 100),
    dispatch_weight_route: Math.round((data.dispatch_weight_route ?? 0.15) * 100),
    dispatch_fleet_performance_threshold: data.dispatch_fleet_performance_threshold ?? 60,
  };
}

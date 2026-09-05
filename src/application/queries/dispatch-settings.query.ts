/** Dispatch Settings Query — canonical workspace operational settings. */
import { productionSupabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
export interface DispatchConfig { auto_dispatch_enabled: boolean; dispatch_weight_distance: number; dispatch_weight_load: number; dispatch_weight_performance: number; dispatch_weight_fairness: number; dispatch_weight_route: number; dispatch_fleet_performance_threshold: number }
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
export async function fetchDispatchConfig(_userId: string): Promise<DispatchConfig | null> {
  const context = await resolveCurrentWorkspace(); if (!context) return null;
  const { data, error } = await productionSupabase.from("workspace_settings").select("operational_settings").eq("workspace_id", context.workspaceId).maybeSingle();
  if (error) throw error; const op = object(data?.operational_settings);
  return {
    auto_dispatch_enabled: op.auto_dispatch_enabled === true,
    dispatch_weight_distance: Math.round(Number(op.dispatch_weight_distance ?? 0.30) * 100),
    dispatch_weight_load: Math.round(Number(op.dispatch_weight_load ?? 0.20) * 100),
    dispatch_weight_performance: Math.round(Number(op.dispatch_weight_performance ?? 0.20) * 100),
    dispatch_weight_fairness: Math.round(Number(op.dispatch_weight_fairness ?? 0.15) * 100),
    dispatch_weight_route: Math.round(Number(op.dispatch_weight_route ?? 0.15) * 100),
    dispatch_fleet_performance_threshold: Number(op.dispatch_fleet_performance_threshold ?? 60),
  };
}

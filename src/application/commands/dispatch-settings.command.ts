/** Dispatch Settings Commands — canonical workspace operational settings. */
import { productionSupabase } from "@/integrations/supabase/client";
import type { DispatchConfig } from "@/application/queries/dispatch-settings.query";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import type { Json } from "@/integrations/supabase/types.production";

function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
async function patchDispatch(patch: Record<string, unknown>): Promise<void> {
  const context = await resolveCurrentWorkspace(); if (!context) throw new Error("No active workspace");
  const { data, error: readError } = await productionSupabase.from("workspace_settings").select("operational_settings").eq("workspace_id", context.workspaceId).maybeSingle();
  if (readError) throw readError;
  const { error } = await productionSupabase.from("workspace_settings").update({ operational_settings: { ...object(data?.operational_settings), ...patch } as Json }).eq("workspace_id", context.workspaceId);
  if (error) throw error;
}
export async function toggleAutoDispatch(_userId: string, enabled: boolean): Promise<void> { await patchDispatch({ auto_dispatch_enabled: enabled }); }
export async function saveDispatchWeights(_userId: string, config: DispatchConfig): Promise<void> {
  await patchDispatch({
    dispatch_weight_distance: config.dispatch_weight_distance / 100,
    dispatch_weight_load: config.dispatch_weight_load / 100,
    dispatch_weight_performance: config.dispatch_weight_performance / 100,
    dispatch_weight_fairness: config.dispatch_weight_fairness / 100,
    dispatch_weight_route: config.dispatch_weight_route / 100,
    dispatch_fleet_performance_threshold: config.dispatch_fleet_performance_threshold,
  });
}

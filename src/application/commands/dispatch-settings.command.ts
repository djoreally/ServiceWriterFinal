/**
 * Dispatch Settings Commands — All write operations for dispatch algorithm config.
 * Extracted from dispatch-settings.query.ts to enforce command/query separation.
 *
 * Phase 2: writes go through the typed API client (`@/lib/api-client`) to the
 * dispatch Hono router (`PATCH /v1/dispatch/settings`). Exported signatures
 * are unchanged. The server verifies user_id matches the caller.
 */
import { apiClient } from "@/lib/api-client";
import type { DispatchConfig } from "@/application/queries/dispatch-settings.query";

export async function toggleAutoDispatch(userId: string, enabled: boolean): Promise<void> {
  await apiClient.patch("/v1/dispatch/settings", {
    user_id: userId,
    values: { auto_dispatch_enabled: enabled },
  });
}

export async function saveDispatchWeights(userId: string, config: DispatchConfig): Promise<void> {
  await apiClient.patch("/v1/dispatch/settings", {
    user_id: userId,
    values: {
      dispatch_weight_distance: config.dispatch_weight_distance / 100,
      dispatch_weight_load: config.dispatch_weight_load / 100,
      dispatch_weight_performance: config.dispatch_weight_performance / 100,
      dispatch_weight_fairness: config.dispatch_weight_fairness / 100,
      dispatch_weight_route: config.dispatch_weight_route / 100,
      dispatch_fleet_performance_threshold: config.dispatch_fleet_performance_threshold,
    },
  });
}

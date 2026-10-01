/**
 * Dispatch Settings Query — Read-only data access for dispatch algorithm config.
 * All write operations have been moved to dispatch-settings.command.ts.
 *
 * Phase 2: reads go through the typed API client (`@/lib/api-client`) to the
 * dispatch Hono router (`GET /v1/dispatch/settings`). Exported signatures
 * are unchanged. The server verifies user_id matches the caller.
 */
import { apiClient } from "@/lib/api-client";

export interface DispatchConfig {
  auto_dispatch_enabled: boolean;
  dispatch_weight_distance: number;
  dispatch_weight_load: number;
  dispatch_weight_performance: number;
  dispatch_weight_fairness: number;
  dispatch_weight_route: number;
  dispatch_fleet_performance_threshold: number;
}

type DispatchSettingsRow = {
  auto_dispatch_enabled: boolean | null;
  dispatch_weight_distance: number | null;
  dispatch_weight_load: number | null;
  dispatch_weight_performance: number | null;
  dispatch_weight_fairness: number | null;
  dispatch_weight_route: number | null;
  dispatch_fleet_performance_threshold: number | null;
};

export async function fetchDispatchConfig(userId: string): Promise<DispatchConfig | null> {
  const response = await apiClient.get<{ data: DispatchSettingsRow | null }>("/v1/dispatch/settings", {
    query: { user_id: userId },
  });
  const data = response.data;
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

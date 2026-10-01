import { apiClient } from "@/lib/api-client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface BusinessPreferencesData {
  date_format: string | null;
  timezone: string | null;
  currency: string | null;
  terminology: unknown;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let cached: { key: string; expiresAt: number; data: BusinessPreferencesData | null } | null = null;
let inFlight: { key: string; promise: Promise<BusinessPreferencesData | null> } | null = null;

/**
 * Shared startup read for regional settings and terminology.
 * Uses the same selected-workspace resolver as appointments, settings, and the
 * rest of the canonical application data layer.
 */
export async function fetchBusinessPreferences(): Promise<BusinessPreferencesData | null> {
  const context = await resolveCurrentWorkspace();
  if (!context) return null;

  const key = `${context.userId}:${context.workspaceId}`;
  if (cached?.key === key && cached.expiresAt > Date.now()) return cached.data;
  if (inFlight?.key === key) return inFlight.promise;

  const promise = (async () => {
    const result = await apiClient.get<BusinessPreferencesData>(
      "/v1/platform/business-preferences",
      { query: { selected_workspace_id: context.workspaceId } },
    );
    cached = { key, expiresAt: Date.now() + CACHE_TTL_MS, data: result };
    return result;
  })().finally(() => {
    if (inFlight?.key === key) inFlight = null;
  });

  inFlight = { key, promise };
  return promise;
}

export function resetBusinessPreferencesCache(): void {
  cached = null;
  inFlight = null;
}

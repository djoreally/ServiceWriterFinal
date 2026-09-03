import { productionSupabase } from "@/integrations/supabase/client";
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
    const [{ data: workspace, error: workspaceError }, { data: settings, error: settingsError }] = await Promise.all([
      productionSupabase
        .from("workspaces")
        .select("timezone,currency_code")
        .eq("id", context.workspaceId)
        .maybeSingle(),
      productionSupabase
        .from("workspace_settings")
        .select("terminology,operational_settings")
        .eq("workspace_id", context.workspaceId)
        .maybeSingle(),
    ]);
    if (workspaceError) throw workspaceError;
    if (settingsError) throw settingsError;

    const operational = settings?.operational_settings && typeof settings.operational_settings === "object" && !Array.isArray(settings.operational_settings)
      ? settings.operational_settings as Record<string, unknown>
      : {};

    const result: BusinessPreferencesData = {
      date_format: typeof operational.date_format === "string" ? operational.date_format : null,
      timezone: workspace?.timezone ?? null,
      currency: workspace?.currency_code?.trim?.() ?? workspace?.currency_code ?? null,
      terminology: settings?.terminology ?? null,
    };
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

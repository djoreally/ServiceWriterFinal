import { productionSupabase } from "@/integrations/supabase/client";

export interface BusinessPreferencesData {
  date_format: string | null;
  timezone: string | null;
  currency: string | null;
  terminology: unknown;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let cached: { userId: string; workspaceId: string; expiresAt: number; data: BusinessPreferencesData | null } | null = null;
let inFlight: Promise<BusinessPreferencesData | null> | null = null;

/**
 * Shared startup read for regional settings and terminology.
 *
 * Final is workspace-scoped. Resolve an active workspace membership first, then
 * read the canonical workspaces/workspace_settings rows. Never fall back to the
 * retired user-scoped business_profiles table.
 */
export async function fetchBusinessPreferences(): Promise<BusinessPreferencesData | null> {
  const { data: { session } } = await productionSupabase.auth.getSession();
  const userId = session?.user?.id ?? null;
  if (!userId) return null;

  if (cached?.userId === userId && cached.expiresAt > Date.now()) return cached.data;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const { data: membership, error: membershipError } = await productionSupabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership?.workspace_id) return null;

    const workspaceId = membership.workspace_id;
    if (cached?.userId === userId && cached.workspaceId === workspaceId && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const [{ data: workspace, error: workspaceError }, { data: settings, error: settingsError }] = await Promise.all([
      productionSupabase
        .from("workspaces")
        .select("timezone,currency_code")
        .eq("id", workspaceId)
        .maybeSingle(),
      productionSupabase
        .from("workspace_settings")
        .select("terminology,operational_settings")
        .eq("workspace_id", workspaceId)
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
    cached = { userId, workspaceId, expiresAt: Date.now() + CACHE_TTL_MS, data: result };
    return result;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

export function resetBusinessPreferencesCache(): void {
  cached = null;
  inFlight = null;
}

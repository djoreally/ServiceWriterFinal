import { supabase } from "@/integrations/supabase/client";

export interface BusinessPreferencesData {
  date_format: string | null;
  timezone: string | null;
  currency: string | null;
  terminology: unknown;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let cached: { userId: string; expiresAt: number; data: BusinessPreferencesData | null } | null = null;
let inFlight: Promise<BusinessPreferencesData | null> | null = null;

/** One shared startup read for regional settings and terminology. */
export async function fetchBusinessPreferences(): Promise<BusinessPreferencesData | null> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id ?? null;
  if (!userId) return null;

  if (cached?.userId === userId && cached.expiresAt > Date.now()) return cached.data;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const { data: membership, error: membershipError } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership?.workspace_id) return null;

    const [{ data: workspace, error: workspaceError }, { data: settings, error: settingsError }] = await Promise.all([
      supabase
        .from("workspaces")
        .select("timezone,currency_code")
        .eq("id", membership.workspace_id)
        .maybeSingle(),
      supabase
        .from("workspace_settings")
        .select("terminology")
        .eq("workspace_id", membership.workspace_id)
        .maybeSingle(),
    ]);
    if (workspaceError) throw workspaceError;
    if (settingsError) throw settingsError;

    const result: BusinessPreferencesData = {
      date_format: null,
      timezone: workspace?.timezone ?? null,
      currency: workspace?.currency_code?.trim?.() ?? workspace?.currency_code ?? null,
      terminology: settings?.terminology ?? null,
    };
    cached = { userId, expiresAt: Date.now() + CACHE_TTL_MS, data: result };
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

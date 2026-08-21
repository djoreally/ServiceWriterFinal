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

  const request = supabase
    .from("business_profiles")
    .select("date_format, timezone, currency, terminology")
    .eq("user_id", userId)
    .maybeSingle();

  inFlight = Promise.resolve(request).then(({ data, error }) => {
      if (error) throw error;
      const result = data as BusinessPreferencesData | null;
      cached = { userId, expiresAt: Date.now() + CACHE_TTL_MS, data: result };
      return result;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

export function resetBusinessPreferencesCache(): void {
  cached = null;
  inFlight = null;
}
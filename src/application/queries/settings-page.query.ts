/**
 * Settings Page Query — compatibility adapter for the legacy Settings screen.
 * Reads are routed to the canonical workspace/workspace_settings model.
 */
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import {
  checkSlugAvailability,
  fetchBusinessSettings,
  resolveCurrentWorkspace,
} from "@/application/queries/settings.query";
import { productionSupabase } from "@/integrations/supabase/client";

/** Get the current authenticated user. */
export async function getCurrentUser() {
  const { data: { user } } = await getCurrentAuthUser();
  return user;
}

/** Fetch the legacy-shaped business profile from canonical workspace settings. */
export async function fetchBusinessProfileDirect(_userId: string) {
  const profile = await fetchBusinessSettings();
  if (!profile) return { data: null, error: null };

  const context = await resolveCurrentWorkspace();
  if (!context) return { data: null, error: null };

  const { data: settings, error } = await productionSupabase
    .from("workspace_settings")
    .select("website_url, marketplace_opt_in, day_hours, operational_settings")
    .eq("workspace_id", context.workspaceId)
    .maybeSingle();

  if (error) return { data: null, error };

  const operational = settings?.operational_settings && typeof settings.operational_settings === "object" && !Array.isArray(settings.operational_settings)
    ? settings.operational_settings as Record<string, unknown>
    : {};

  return {
    data: {
      ...profile,
      website_url: settings?.website_url ?? "",
      marketplace_opt_in: settings?.marketplace_opt_in ?? false,
      day_hours: settings?.day_hours ?? null,
      cover_image_url: typeof operational.cover_image_url === "string" ? operational.cover_image_url : "",
      weather_guard_enabled: operational.weather_guard_enabled === true,
      weather_guard_settings: operational.weather_guard_settings ?? null,
    },
    error: null,
  };
}

/** Check booking-slug availability against canonical workspace tables. */
export async function checkSlugDirect(slug: string) {
  const available = await checkSlugAvailability(slug);
  if (available === null) {
    return { data: null, error: new Error("Unable to verify booking link availability") };
  }
  if (available) return { data: null, error: null };

  const context = await resolveCurrentWorkspace();
  return {
    data: context ? { id: context.workspaceId, user_id: context.userId } : { id: "", user_id: "" },
    error: null,
  };
}

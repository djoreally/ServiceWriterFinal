/**
 * Settings Page Commands — compatibility adapter for the legacy Settings screen.
 * Writes are routed to the canonical workspace/workspace_settings model.
 */
import { productionSupabase, supabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import type { Json } from "@/integrations/supabase/types.production";

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/** Upload a logo to storage. */
export async function uploadLogo(userId: string, file: File) {
  const fileExt = file.name.split('.').pop();
  const fileName = `${userId}/logo.${fileExt}`;
  const { error } = await supabase.storage.from("logos").upload(fileName, file, { upsert: true });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage.from("logos").getPublicUrl(fileName);
  return publicUrl;
}

/** Upload a cover image to storage. */
export async function uploadCoverImage(userId: string, file: File) {
  const fileExt = file.name.split('.').pop();
  const fileName = `${userId}/cover.${fileExt}`;
  const { error } = await supabase.storage.from("logos").upload(fileName, file, { upsert: true });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage.from("logos").getPublicUrl(fileName);
  return publicUrl;
}

/** Upsert the legacy-shaped business profile into canonical workspace tables. */
export async function upsertBusinessProfile(_userId: string, data: Record<string, unknown>) {
  const context = await resolveCurrentWorkspace();
  if (!context?.workspaceId) {
    return {
      data: null,
      error: { code: "workspace_not_found", message: "No active workspace found" },
    };
  }

  const workspacePatch: Record<string, unknown> = {};
  if (typeof data.business_name === "string") workspacePatch.name = data.business_name;
  if (typeof data.timezone === "string" && data.timezone) workspacePatch.timezone = data.timezone;
  if (typeof data.currency === "string" && data.currency) workspacePatch.currency_code = data.currency;
  if (typeof data.booking_slug === "string" && data.booking_slug) workspacePatch.slug = data.booking_slug;

  if (Object.keys(workspacePatch).length > 0) {
    const { error } = await productionSupabase
      .from("workspaces")
      .update(workspacePatch as never)
      .eq("id", context.workspaceId);
    if (error) return { data: null, error };
  }

  const { data: currentSettings, error: readError } = await productionSupabase
    .from("workspace_settings")
    .select("operational_settings")
    .eq("workspace_id", context.workspaceId)
    .maybeSingle();
  if (readError) return { data: null, error: readError };

  const operational = {
    ...asObject(currentSettings?.operational_settings),
    date_format: data.date_format,
    service_address: data.service_address,
    service_coordinates: data.service_coordinates,
    cover_image_url: data.cover_image_url,
    weather_guard_enabled: data.weather_guard_enabled,
    weather_guard_settings: data.weather_guard_settings,
  };

  const settingsPatch: Record<string, unknown> = {
    owner_name: data.owner_name || null,
    phone: data.phone || null,
    email: data.email || null,
    address_line1: data.address || null,
    website_url: data.website_url || null,
    logo_url: data.logo_url || null,
    terminology: toJson(data.terminology ?? {}),
    opening_time: data.opening_time || null,
    closing_time: data.closing_time || null,
    working_days: data.working_days ?? [],
    booking_slug: data.booking_slug || null,
    service_radius_miles: data.service_radius_miles ?? null,
    marketplace_opt_in: data.marketplace_opt_in === true,
    day_hours: toJson(data.day_hours ?? {}),
    operational_settings: toJson(operational),
  };

  return productionSupabase
    .from("workspace_settings")
    .update(settingsPatch as never)
    .eq("workspace_id", context.workspaceId);
}

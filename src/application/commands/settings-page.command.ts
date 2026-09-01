/**
 * Settings Page Commands — All write operations for the Settings page.
 * Extracted from settings-page.query.ts to enforce command/query separation.
 */
import { supabase } from "@/integrations/supabase/client";

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

import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

/** Upsert (insert or update) business profile. */
export async function upsertBusinessProfile(userId: string, data: Record<string, unknown>) {
  // Sync to canonical workspace_settings when workspace context is present
  const context = await resolveCurrentWorkspace();
  if (context?.workspaceId) {
    const wsSettingsPatch: Record<string, unknown> = {};
    if (data.business_name) wsSettingsPatch.owner_name = data.owner_name ?? data.business_name;
    if (data.phone) wsSettingsPatch.phone = data.phone;
    if (data.email) wsSettingsPatch.email = data.email;
    if (data.address) wsSettingsPatch.address_line1 = data.address;
    if (data.logo_url) wsSettingsPatch.logo_url = data.logo_url;
    if (data.timezone) wsSettingsPatch.timezone = data.timezone;
    if (data.opening_time) wsSettingsPatch.opening_time = data.opening_time;
    if (data.closing_time) wsSettingsPatch.closing_time = data.closing_time;
    if (data.working_days) wsSettingsPatch.working_days = data.working_days;
    if (data.booking_slug) wsSettingsPatch.booking_slug = data.booking_slug;
    if (data.service_radius_miles) wsSettingsPatch.service_radius_miles = data.service_radius_miles;
    if (data.service_address) wsSettingsPatch.service_address = data.service_address;

    if (Object.keys(wsSettingsPatch).length > 0) {
      await (supabase as any)
        .from("workspace_settings")
        .update(wsSettingsPatch as never)
        .eq("workspace_id", context.workspaceId);
    }
  }

  const { data: existing } = await supabase
    .from("business_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    return supabase.from("business_profiles").update(data as never).eq("user_id", userId);
  } else {
    return supabase.from("business_profiles").insert({ user_id: userId, ...data });
  }
}

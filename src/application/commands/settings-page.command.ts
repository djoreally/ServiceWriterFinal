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

/** Upsert (insert or update) business profile. */
export async function upsertBusinessProfile(userId: string, data: Record<string, unknown>) {
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

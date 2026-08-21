/**
 * Settings Page Query — Read-only data access for the Settings page.
 * All write operations have been moved to settings-page.command.ts.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
/** Get the current authenticated user. */
export async function getCurrentUser() {
  const { data: { user } } = await getCurrentAuthUser();
  return user;
}

/** Fetch business profile for a user. */
export async function fetchBusinessProfileDirect(userId: string) {
  return supabase
    .from("business_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
}

/** Check if a booking slug is available (direct). */
export async function checkSlugDirect(slug: string) {
  return supabase
    .from("business_profiles")
    .select("id, user_id")
    .eq("booking_slug", slug)
    .maybeSingle();
}

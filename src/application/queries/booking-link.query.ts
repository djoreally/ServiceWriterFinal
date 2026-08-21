/**
 * Booking Link Query — Slug availability check for booking link config
 */

import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export async function checkBookingSlugAvailability(slug: string): Promise<{ available: boolean | null; error: unknown }> {
  const { data: { user } } = await getCurrentAuthUser();
  
  const { data, error } = await supabase
    .from("business_profiles")
    .select("id, user_id")
    .eq("booking_slug", slug)
    .maybeSingle();

  if (error) return { available: null, error };

  const isAvailable = !data || data.user_id === user?.id;
  return { available: isAvailable, error: null };
}

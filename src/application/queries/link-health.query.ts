/**
 * Link Health Query — Fetches business link fields for validation
 */

import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface BusinessLinkData {
  booking_slug: string | null;
  google_review_url: string | null;
  yelp_review_url: string | null;
  website_url: string | null;
}

export async function fetchBusinessLinks(): Promise<{
  data: BusinessLinkData | null;
  error: unknown;
}> {
  const {
    data: { user },
  } = await getCurrentAuthUser();

  if (!user) return { data: null, error: new Error("Not authenticated") };

  const { data, error } = await supabase
    .from("business_profiles")
    .select("booking_slug, google_review_url, yelp_review_url, website_url")
    .eq("user_id", user.id)
    .maybeSingle();

  return { data: data as BusinessLinkData | null, error };
}

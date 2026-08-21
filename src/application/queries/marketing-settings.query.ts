/**
 * Marketing Settings Query — Read-only data access for marketing config.
 * All write operations have been moved to marketing-settings.command.ts.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface MarketingSettingsData {
  google_review_url: string;
  yelp_review_url: string;
  review_request_delay_hours: number;
  appointment_reminder_hours: number;
  service_reminder_months: number;
}

export async function fetchMarketingSettings(): Promise<MarketingSettingsData | null> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return null;

  const { data } = await supabase
    .from("business_profiles")
    .select("google_review_url, yelp_review_url, review_request_delay_hours, appointment_reminder_hours, service_reminder_months")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) return null;

  return {
    google_review_url: data.google_review_url || "",
    yelp_review_url: data.yelp_review_url || "",
    review_request_delay_hours: data.review_request_delay_hours || 24,
    appointment_reminder_hours: data.appointment_reminder_hours || 24,
    service_reminder_months: data.service_reminder_months || 3,
  };
}

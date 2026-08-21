/**
 * Marketing Settings Commands — All write operations for marketing config.
 * Extracted from marketing-settings.query.ts to enforce command/query separation.
 */
import { supabase } from "@/integrations/supabase/client";
import type { MarketingSettingsData } from "@/application/queries/marketing-settings.query";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export async function saveMarketingSettings(settings: MarketingSettingsData): Promise<void> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("business_profiles")
    .update({
      google_review_url: settings.google_review_url || null,
      yelp_review_url: settings.yelp_review_url || null,
      review_request_delay_hours: settings.review_request_delay_hours,
      appointment_reminder_hours: settings.appointment_reminder_hours,
      service_reminder_months: settings.service_reminder_months,
    })
    .eq("user_id", user.id);

  if (error) throw error;
}

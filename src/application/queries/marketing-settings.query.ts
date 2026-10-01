/**
 * Marketing Settings Query — Read-only data access for marketing config.
 * All write operations have been moved to marketing-settings.command.ts.
 */
import { apiClient } from "@/lib/api-client";

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

  const { data } = await apiClient.get<{ data: MarketingSettingsData | null }>("/v1/crm/marketing/settings");
  return data;
}

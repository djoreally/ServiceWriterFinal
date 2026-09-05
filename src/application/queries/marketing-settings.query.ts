/** Marketing Settings Query — canonical workspace settings. */
import { productionSupabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface MarketingSettingsData {
  google_review_url: string;
  yelp_review_url: string;
  review_request_delay_hours: number;
  appointment_reminder_hours: number;
  service_reminder_months: number;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function fetchMarketingSettings(): Promise<MarketingSettingsData | null> {
  const context = await resolveCurrentWorkspace();
  if (!context) return null;
  const { data, error } = await productionSupabase
    .from("workspace_settings")
    .select("google_review_url,yelp_review_url,operational_settings")
    .eq("workspace_id", context.workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const operational = object(data.operational_settings);
  return {
    google_review_url: data.google_review_url || "",
    yelp_review_url: data.yelp_review_url || "",
    review_request_delay_hours: Number(operational.review_request_delay_hours ?? 24),
    appointment_reminder_hours: Number(operational.appointment_reminder_hours ?? 24),
    service_reminder_months: Number(operational.service_reminder_months ?? 3),
  };
}

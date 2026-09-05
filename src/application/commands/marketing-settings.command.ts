/** Marketing Settings Commands — canonical workspace settings. */
import { productionSupabase } from "@/integrations/supabase/client";
import type { MarketingSettingsData } from "@/application/queries/marketing-settings.query";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import type { Json } from "@/integrations/supabase/types.production";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function saveMarketingSettings(settings: MarketingSettingsData): Promise<void> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Not authenticated");
  const { data: current, error: readError } = await productionSupabase
    .from("workspace_settings")
    .select("operational_settings")
    .eq("workspace_id", context.workspaceId)
    .maybeSingle();
  if (readError) throw readError;
  const operational = {
    ...object(current?.operational_settings),
    review_request_delay_hours: settings.review_request_delay_hours,
    appointment_reminder_hours: settings.appointment_reminder_hours,
    service_reminder_months: settings.service_reminder_months,
  };
  const { error } = await productionSupabase
    .from("workspace_settings")
    .update({
      google_review_url: settings.google_review_url || null,
      yelp_review_url: settings.yelp_review_url || null,
      operational_settings: operational as Json,
    })
    .eq("workspace_id", context.workspaceId);
  if (error) throw error;
}

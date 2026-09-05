import { productionSupabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface PostHogOrganizationProfile {
  business_name: string | null; created_at: string | null; onboarding_completed: boolean | null;
  marketplace_opt_in: boolean | null; stripe_onboarding_complete: boolean | null;
  stripe_charges_enabled: boolean | null; sms_transactional_enabled: boolean | null;
  sms_marketing_enabled: boolean | null; marketing_email_enabled: boolean | null;
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export async function fetchPostHogOrganizationProfile(_organizationId: string): Promise<PostHogOrganizationProfile | null> {
  const context = await resolveCurrentWorkspace();
  if (!context) return null;
  const [{ data: workspace, error: workspaceError }, { data: settings, error: settingsError }] = await Promise.all([
    productionSupabase.from("workspaces").select("name,created_at").eq("id", context.workspaceId).maybeSingle(),
    productionSupabase.from("workspace_settings").select("marketplace_opt_in,operational_settings").eq("workspace_id", context.workspaceId).maybeSingle(),
  ]);
  if (workspaceError) throw workspaceError;
  if (settingsError) throw settingsError;
  if (!workspace) return null;
  const operational = object(settings?.operational_settings);
  return {
    business_name: workspace.name ?? null, created_at: workspace.created_at ?? null,
    onboarding_completed: operational.onboarding_completed === true,
    marketplace_opt_in: settings?.marketplace_opt_in ?? false,
    stripe_onboarding_complete: operational.stripe_onboarding_complete === true,
    stripe_charges_enabled: operational.stripe_charges_enabled === true,
    sms_transactional_enabled: operational.sms_transactional_enabled !== false,
    sms_marketing_enabled: operational.sms_marketing_enabled === true,
    marketing_email_enabled: operational.marketing_email_enabled !== false,
  };
}

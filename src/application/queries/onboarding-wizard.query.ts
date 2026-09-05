/** Onboarding Wizard Query — canonical workspace/settings data access. */
import { productionSupabase } from "@/integrations/supabase/client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function getOnboardingUser(): Promise<{ id: string; email: string } | null> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return null;
  return { id: user.id, email: user.email || "" };
}

/** Load the legacy-shaped onboarding view from canonical workspace tables. */
export async function loadOnboardingProfile(_userId: string) {
  const context = await resolveCurrentWorkspace();
  if (!context) return null;

  const [{ data: workspace, error: workspaceError }, { data: settings, error: settingsError }] = await Promise.all([
    productionSupabase
      .from("workspaces")
      .select("id,name,slug,timezone,currency_code")
      .eq("id", context.workspaceId)
      .maybeSingle(),
    productionSupabase
      .from("workspace_settings")
      .select("owner_name,email,phone,logo_url,website_url,service_radius_miles,working_days,day_hours,operational_settings")
      .eq("workspace_id", context.workspaceId)
      .maybeSingle(),
  ]);
  if (workspaceError) throw workspaceError;
  if (settingsError) throw settingsError;
  if (!workspace) return null;

  const operational = object(settings?.operational_settings);
  return {
    user_id: context.userId,
    workspace_id: context.workspaceId,
    business_name: workspace.name || "",
    owner_name: settings?.owner_name || "",
    email: settings?.email || "",
    phone: settings?.phone || "",
    logo_url: settings?.logo_url || null,
    service_address: typeof operational.service_address === "string" ? operational.service_address : "",
    service_radius_miles: Number(settings?.service_radius_miles ?? 25),
    timezone: workspace.timezone || "America/New_York",
    service_coordinates: object(operational.service_coordinates),
    working_days: settings?.working_days ?? [],
    day_hours: object(settings?.day_hours),
    website_url: settings?.website_url || "",
    brand_primary_color: typeof operational.brand_primary_color === "string" ? operational.brand_primary_color : null,
    brand_secondary_color: typeof operational.brand_secondary_color === "string" ? operational.brand_secondary_color : null,
    brand_font_family: typeof operational.brand_font_family === "string" ? operational.brand_font_family : null,
    onboarding_step: Number(operational.onboarding_step ?? 0),
    onboarding_completed: operational.onboarding_completed === true,
  };
}

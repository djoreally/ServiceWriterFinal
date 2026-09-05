/** Onboarding Wizard Commands — canonical workspace/settings writes. */
import { productionSupabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace, invalidateBusinessSettings } from "@/application/queries/settings.query";
import type { Json } from "@/integrations/supabase/types.production";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function json(value: unknown): Json {
  return JSON.parse(JSON.stringify(value ?? {})) as Json;
}

export async function saveOnboardingProgress(profileData: Record<string, unknown>): Promise<void> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Create a workspace before saving onboarding progress");

  const workspacePatch: Record<string, unknown> = {};
  if (typeof profileData.business_name === "string" && profileData.business_name.trim()) workspacePatch.name = profileData.business_name.trim();
  if (typeof profileData.timezone === "string" && profileData.timezone.trim()) workspacePatch.timezone = profileData.timezone.trim();
  if (Object.keys(workspacePatch).length > 0) {
    const { error } = await productionSupabase.from("workspaces").update(workspacePatch as never).eq("id", context.workspaceId);
    if (error) throw error;
  }

  const { data: current, error: readError } = await productionSupabase
    .from("workspace_settings")
    .select("operational_settings")
    .eq("workspace_id", context.workspaceId)
    .maybeSingle();
  if (readError) throw readError;

  const operational = {
    ...object(current?.operational_settings),
    service_address: profileData.service_address ?? null,
    service_coordinates: profileData.service_coordinates ?? null,
    brand_primary_color: profileData.brand_primary_color ?? null,
    brand_secondary_color: profileData.brand_secondary_color ?? null,
    brand_font_family: profileData.brand_font_family ?? null,
    onboarding_step: Number(profileData.onboarding_step ?? 0),
    onboarding_completed: profileData.onboarding_completed === true,
  };

  const { error } = await productionSupabase
    .from("workspace_settings")
    .update({
      owner_name: typeof profileData.owner_name === "string" ? profileData.owner_name : null,
      email: typeof profileData.email === "string" && profileData.email ? profileData.email : null,
      phone: typeof profileData.phone === "string" ? profileData.phone : null,
      logo_url: typeof profileData.logo_url === "string" ? profileData.logo_url : null,
      website_url: typeof profileData.website_url === "string" ? profileData.website_url || null : null,
      service_radius_miles: Number(profileData.service_radius_miles ?? 25),
      working_days: Array.isArray(profileData.working_days) ? profileData.working_days as string[] : [],
      day_hours: json(profileData.day_hours),
      operational_settings: json(operational),
    } as never)
    .eq("workspace_id", context.workspaceId);
  if (error) throw error;
  invalidateBusinessSettings(context.workspaceId);
}

export async function addOnboardingService(_userId: string, service: {
  name: string;
  description: string;
  price: number;
  duration: number;
}): Promise<void> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("No active workspace");
  const { error } = await productionSupabase.from("service_catalog").insert({
    workspace_id: context.workspaceId,
    name: service.name,
    description: service.description || null,
    labor_price: service.price,
    estimated_minutes: service.duration,
    is_active: true,
  });
  if (error) throw error;
}

export async function addOnboardingServices(
  _userId: string,
  services: Array<{ name: string; description: string; price: number | null; duration_minutes: number }>,
): Promise<number> {
  if (services.length === 0) return 0;
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("No active workspace");
  const rows = services.map((service) => ({
    workspace_id: context.workspaceId,
    name: service.name,
    description: service.description || null,
    labor_price: service.price ?? 0,
    estimated_minutes: service.duration_minutes,
    is_active: true,
    metadata: service.price == null ? { pricing_mode: "quote" } : {},
  }));
  const { error } = await productionSupabase.from("service_catalog").insert(rows);
  if (error) throw error;
  return rows.length;
}

/** Provider marketplace listing backed by canonical workspace tables. */
import { supabase } from "@/integrations/supabase/client";

export const MARKETPLACE_BOOKING_SOURCE = "provider_directory";
export const MARKETPLACE_VIEW_EVENT = "marketplace_profile_view";

export interface MarketplaceListing {
  business_name: string; logo_url: string | null; cover_image_url: string | null; marketplace_description: string | null;
  phone: string | null; email: string | null; website_url: string | null; booking_slug: string | null;
  service_address: string | null; city: string | null; state: string | null; postal_code: string | null;
  service_radius_miles: number | null; marketplace_service_area_zips: string[]; marketplace_opt_in: boolean;
  marketplace_accept_new_customers: boolean; marketplace_allow_same_day: boolean; marketplace_auto_accept: boolean;
  marketplace_max_jobs_per_day: number | null; require_approval: boolean; min_lead_time_hours: number | null;
  max_advance_days: number | null; working_days: string[]; opening_time: string | null; closing_time: string | null;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function fetchMarketplaceListing(userId: string): Promise<MarketplaceListing | null> {
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, name")
    .eq("created_by", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (workspaceError || !workspace) return null;

  const { data: settings, error: settingsError } = await supabase
    .from("workspace_settings")
    .select("logo_url, phone, email, website_url, booking_slug, address_line1, address_line2, city, region, postal_code, service_radius_miles, marketplace_opt_in, require_approval, min_lead_time_hours, max_advance_days, working_days, opening_time, closing_time, operational_settings")
    .eq("workspace_id", workspace.id)
    .maybeSingle();
  if (settingsError || !settings) return null;

  const marketplace = asObject(asObject(settings.operational_settings).marketplace);
  const zips = Array.isArray(marketplace.service_area_zips)
    ? marketplace.service_area_zips.filter((value): value is string => typeof value === "string")
    : [];
  const address = [settings.address_line1, settings.address_line2].filter(Boolean).join(", ") || null;

  return {
    business_name: workspace.name ?? "",
    logo_url: settings.logo_url ?? null,
    cover_image_url: typeof marketplace.cover_image_url === "string" ? marketplace.cover_image_url : null,
    marketplace_description: typeof marketplace.description === "string" ? marketplace.description : null,
    phone: settings.phone ?? null,
    email: settings.email ?? null,
    website_url: settings.website_url ?? null,
    booking_slug: settings.booking_slug ?? null,
    service_address: address,
    city: settings.city ?? null,
    state: settings.region ?? null,
    postal_code: settings.postal_code ?? null,
    service_radius_miles: settings.service_radius_miles == null ? null : Number(settings.service_radius_miles),
    marketplace_service_area_zips: zips,
    marketplace_opt_in: Boolean(settings.marketplace_opt_in),
    marketplace_accept_new_customers: marketplace.accept_new_customers !== false,
    marketplace_allow_same_day: marketplace.allow_same_day !== false,
    marketplace_auto_accept: Boolean(marketplace.auto_accept),
    marketplace_max_jobs_per_day: typeof marketplace.max_jobs_per_day === "number" ? marketplace.max_jobs_per_day : null,
    require_approval: Boolean(settings.require_approval),
    min_lead_time_hours: settings.min_lead_time_hours ?? null,
    max_advance_days: settings.max_advance_days ?? null,
    working_days: settings.working_days ?? [],
    opening_time: settings.opening_time ?? null,
    closing_time: settings.closing_time ?? null,
  };
}

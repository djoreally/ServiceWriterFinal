/** Provider Marketplace Dashboard — canonical workspace-backed writes. */
import { supabase } from "@/integrations/supabase/client";

export interface MarketplaceListingUpdate {
  business_name?: string; booking_slug?: string; logo_url?: string | null; cover_image_url?: string | null;
  marketplace_description?: string | null; phone?: string | null; website_url?: string | null; service_address?: string | null;
  city?: string | null; state?: string | null; postal_code?: string | null; service_radius_miles?: number | null;
  marketplace_service_area_zips?: string[]; marketplace_opt_in?: boolean; marketplace_accept_new_customers?: boolean;
  marketplace_allow_same_day?: boolean; marketplace_auto_accept?: boolean; marketplace_max_jobs_per_day?: number | null;
  require_approval?: boolean; min_lead_time_hours?: number | null; max_advance_days?: number | null; working_days?: string[];
  opening_time?: string | null; closing_time?: string | null;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function workspaceIdForOwner(userId: string): Promise<string> {
  const { data, error } = await supabase.from("workspaces").select("id").eq("created_by", userId).eq("is_active", true).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("No active workspace found");
  return data.id;
}

export async function saveMarketplaceListing(userId: string, updates: MarketplaceListingUpdate): Promise<void> {
  const workspaceId = await workspaceIdForOwner(userId);

  if (updates.business_name !== undefined) {
    const { error } = await supabase.from("workspaces").update({ name: updates.business_name }).eq("id", workspaceId);
    if (error) throw error;
  }

  const { data: current, error: readError } = await supabase.from("workspace_settings").select("operational_settings").eq("workspace_id", workspaceId).maybeSingle();
  if (readError) throw readError;
  const operational = asObject(current?.operational_settings);
  const marketplace = asObject(operational.marketplace);

  const settingsUpdate: Record<string, unknown> = {};
  const directMap: Record<string, string> = {
    booking_slug: "booking_slug", logo_url: "logo_url", phone: "phone", website_url: "website_url", city: "city",
    state: "region", postal_code: "postal_code", service_radius_miles: "service_radius_miles", marketplace_opt_in: "marketplace_opt_in",
    require_approval: "require_approval", min_lead_time_hours: "min_lead_time_hours", max_advance_days: "max_advance_days",
    working_days: "working_days", opening_time: "opening_time", closing_time: "closing_time", service_address: "address_line1",
  };
  for (const [source, target] of Object.entries(directMap)) {
    if (Object.prototype.hasOwnProperty.call(updates, source)) settingsUpdate[target] = updates[source as keyof MarketplaceListingUpdate];
  }

  const marketplacePatch: Record<string, unknown> = {};
  if (updates.cover_image_url !== undefined) marketplacePatch.cover_image_url = updates.cover_image_url;
  if (updates.marketplace_description !== undefined) marketplacePatch.description = updates.marketplace_description;
  if (updates.marketplace_service_area_zips !== undefined) marketplacePatch.service_area_zips = updates.marketplace_service_area_zips;
  if (updates.marketplace_accept_new_customers !== undefined) marketplacePatch.accept_new_customers = updates.marketplace_accept_new_customers;
  if (updates.marketplace_allow_same_day !== undefined) marketplacePatch.allow_same_day = updates.marketplace_allow_same_day;
  if (updates.marketplace_auto_accept !== undefined) marketplacePatch.auto_accept = updates.marketplace_auto_accept;
  if (updates.marketplace_max_jobs_per_day !== undefined) marketplacePatch.max_jobs_per_day = updates.marketplace_max_jobs_per_day;
  if (Object.keys(marketplacePatch).length) settingsUpdate.operational_settings = { ...operational, marketplace: { ...marketplace, ...marketplacePatch } };

  if (Object.keys(settingsUpdate).length) {
    const { error } = await (supabase as any).from("workspace_settings").update(settingsUpdate).eq("workspace_id", workspaceId);
    if (error) throw error;
  }
}

export async function setMarketplaceVisibility(userId: string, listed: boolean): Promise<void> { await saveMarketplaceListing(userId, { marketplace_opt_in: listed }); }
export async function replyToReview(reviewId: string, reply: string): Promise<void> { const { error } = await supabase.from("testimonials").update({ provider_reply: reply, provider_replied_at: new Date().toISOString() } as never).eq("id", reviewId); if (error) throw error; }
export async function updateMarketplaceLeadStatus(appointmentId: string, status: string): Promise<void> { const { error } = await supabase.from("appointments").update({ status } as never).eq("id", appointmentId); if (error) throw error; }

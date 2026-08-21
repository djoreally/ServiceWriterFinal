/**
 * Provider Marketplace Dashboard — write operations.
 */
import { supabase } from "@/integrations/supabase/client";

export interface MarketplaceListingUpdate {
  business_name?: string;
  booking_slug?: string;
  logo_url?: string | null;
  cover_image_url?: string | null;
  marketplace_description?: string | null;
  phone?: string | null;
  website_url?: string | null;
  service_address?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  service_radius_miles?: number | null;
  marketplace_service_area_zips?: string[];
  marketplace_opt_in?: boolean;
  marketplace_accept_new_customers?: boolean;
  marketplace_allow_same_day?: boolean;
  marketplace_auto_accept?: boolean;
  marketplace_max_jobs_per_day?: number | null;
  require_approval?: boolean;
  min_lead_time_hours?: number | null;
  max_advance_days?: number | null;
  working_days?: string[];
  opening_time?: string | null;
  closing_time?: string | null;
}

export async function saveMarketplaceListing(userId: string, updates: MarketplaceListingUpdate): Promise<void> {
  const { error } = await supabase
    .from("business_profiles")
    .update(updates as never)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function setMarketplaceVisibility(userId: string, listed: boolean): Promise<void> {
  await saveMarketplaceListing(userId, { marketplace_opt_in: listed });
}

export async function replyToReview(reviewId: string, reply: string): Promise<void> {
  const { error } = await supabase
    .from("testimonials")
    .update({ provider_reply: reply, provider_replied_at: new Date().toISOString() } as never)
    .eq("id", reviewId);
  if (error) throw error;
}

export async function updateMarketplaceLeadStatus(appointmentId: string, status: string): Promise<void> {
  const { error } = await supabase
    .from("appointments")
    .update({ status } as never)
    .eq("id", appointmentId);
  if (error) throw error;
}

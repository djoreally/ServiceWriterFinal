/**
 * Provider Marketplace Dashboard — read-only data access.
 * Scoped to the authenticated provider (business_profiles.user_id = auth.uid()).
 */
import { supabase } from "@/integrations/supabase/client";

export const MARKETPLACE_BOOKING_SOURCE = "provider_directory";
export const MARKETPLACE_VIEW_EVENT = "marketplace_profile_view";

export interface MarketplaceListing {
  business_name: string;
  logo_url: string | null;
  cover_image_url: string | null;
  marketplace_description: string | null;
  phone: string | null;
  email: string | null;
  website_url: string | null;
  booking_slug: string | null;
  service_address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  service_radius_miles: number | null;
  marketplace_service_area_zips: string[];
  marketplace_opt_in: boolean;
  marketplace_accept_new_customers: boolean;
  marketplace_allow_same_day: boolean;
  marketplace_auto_accept: boolean;
  marketplace_max_jobs_per_day: number | null;
  require_approval: boolean;
  min_lead_time_hours: number | null;
  max_advance_days: number | null;
  working_days: string[];
  opening_time: string | null;
  closing_time: string | null;
}

const LISTING_COLUMNS = [
  "business_name",
  "logo_url",
  "cover_image_url",
  "marketplace_description",
  "phone",
  "email",
  "website_url",
  "booking_slug",
  "service_address",
  "city",
  "state",
  "postal_code",
  "service_radius_miles",
  "marketplace_service_area_zips",
  "marketplace_opt_in",
  "marketplace_accept_new_customers",
  "marketplace_allow_same_day",
  "marketplace_auto_accept",
  "marketplace_max_jobs_per_day",
  "require_approval",
  "min_lead_time_hours",
  "max_advance_days",
  "working_days",
  "opening_time",
  "closing_time",
].join(", ");

export async function fetchMarketplaceListing(userId: string): Promise<MarketplaceListing | null> {
  const { data, error } = await supabase
    .from("business_profiles")
    .select(LISTING_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as unknown as Record<string, unknown>;

  return {
    business_name: (row.business_name as string) ?? "",
    logo_url: (row.logo_url as string) ?? null,
    cover_image_url: (row.cover_image_url as string) ?? null,
    marketplace_description: (row.marketplace_description as string) ?? null,
    phone: (row.phone as string) ?? null,
    email: (row.email as string) ?? null,
    website_url: (row.website_url as string) ?? null,
    booking_slug: (row.booking_slug as string) ?? null,
    service_address: (row.service_address as string) ?? null,
    city: (row.city as string) ?? null,
    state: (row.state as string) ?? null,
    postal_code: (row.postal_code as string) ?? null,
    service_radius_miles: (row.service_radius_miles as number) ?? null,
    marketplace_service_area_zips: (row.marketplace_service_area_zips as string[]) ?? [],
    marketplace_opt_in: Boolean(row.marketplace_opt_in),
    marketplace_accept_new_customers: row.marketplace_accept_new_customers !== false,
    marketplace_allow_same_day: row.marketplace_allow_same_day !== false,
    marketplace_auto_accept: Boolean(row.marketplace_auto_accept),
    marketplace_max_jobs_per_day: (row.marketplace_max_jobs_per_day as number) ?? null,
    require_approval: Boolean(row.require_approval),
    min_lead_time_hours: (row.min_lead_time_hours as number) ?? null,
    max_advance_days: (row.max_advance_days as number) ?? null,
    working_days: (row.working_days as string[]) ?? [],
    opening_time: (row.opening_time as string) ?? null,
    closing_time: (row.closing_time as string) ?? null,
  };
}

export interface MarketplaceMetrics {
  impressions: number;
  views: number;
  bookingClicks: number;
  quoteClicks: number;
  bookings: number;
  completed: number;
  revenue: number;
  conversionRate: number;
}

function monthStartIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

const FUNNEL_EVENTS = {
  impressions: "marketplace_listing_impression",
  views: MARKETPLACE_VIEW_EVENT,
  bookingClicks: "marketplace_booking_click",
  quoteClicks: "marketplace_quote_click",
} as const;

export async function fetchMarketplaceMetrics(
  userId: string,
  scope: "month" | "all" = "month",
): Promise<MarketplaceMetrics> {
  const since = scope === "month" ? monthStartIso() : null;

  const countEvent = (eventName: string) => {
    let q = supabase
      .from("analytics_events")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", userId)
      .eq("event_name", eventName);
    if (since) q = q.gte("created_at", since);
    return q;
  };

  let apptQuery = supabase
    .from("appointments")
    .select("status, estimated_cost, created_at")
    .eq("user_id", userId)
    .eq("source", MARKETPLACE_BOOKING_SOURCE);
  if (since) apptQuery = apptQuery.gte("created_at", since);

  const [impressionsRes, viewsRes, bookingClicksRes, quoteClicksRes, { data: appointments }] = await Promise.all([
    countEvent(FUNNEL_EVENTS.impressions),
    countEvent(FUNNEL_EVENTS.views),
    countEvent(FUNNEL_EVENTS.bookingClicks),
    countEvent(FUNNEL_EVENTS.quoteClicks),
    apptQuery,
  ]);

  const rows = (appointments || []) as { status: string | null; estimated_cost: number | null }[];
  const completedRows = rows.filter((r) => r.status === "completed");
  const revenue = completedRows.reduce((sum, r) => sum + Number(r.estimated_cost ?? 0), 0);
  const viewCount = viewsRes.count ?? 0;

  return {
    impressions: impressionsRes.count ?? 0,
    views: viewCount,
    bookingClicks: bookingClicksRes.count ?? 0,
    quoteClicks: quoteClicksRes.count ?? 0,
    bookings: rows.length,
    completed: completedRows.length,
    revenue,
    conversionRate: viewCount > 0 ? (rows.length / viewCount) * 100 : 0,
  };
}


export interface MarketplaceLead {
  id: string;
  title: string;
  status: string;
  scheduled_date: string;
  scheduled_time: string;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  customer_name: string | null;
  vehicle_label: string | null;
  estimated_cost: number | null;
}

export async function fetchMarketplaceLeads(userId: string): Promise<MarketplaceLead[]> {
  const { data } = await supabase
    .from("appointments")
    .select(
      "id, title, status, scheduled_date, scheduled_time, guest_name, guest_email, guest_phone, estimated_cost, customers(name), vehicles(year, make, model)",
    )
    .eq("user_id", userId)
    .eq("source", MARKETPLACE_BOOKING_SOURCE)
    .order("scheduled_date", { ascending: true })
    .limit(100);

  return ((data || []) as Record<string, any>[]).map((row) => ({
    id: row.id,
    title: row.title ?? "Marketplace booking",
    status: row.status ?? "pending",
    scheduled_date: row.scheduled_date,
    scheduled_time: row.scheduled_time,
    guest_name: row.guest_name ?? null,
    guest_email: row.guest_email ?? null,
    guest_phone: row.guest_phone ?? null,
    customer_name: row.customers?.name ?? null,
    vehicle_label: row.vehicles
      ? [row.vehicles.year, row.vehicles.make, row.vehicles.model].filter(Boolean).join(" ")
      : null,
    estimated_cost: row.estimated_cost ?? null,
  }));
}

export interface MarketplaceService {
  id: string;
  name: string;
  description: string | null;
  default_price: number | null;
  estimated_duration: number | null;
  is_active: boolean;
}

export async function fetchMarketplaceServices(userId: string): Promise<MarketplaceService[]> {
  const { data } = await supabase
    .from("service_catalog")
    .select("id, name, description, default_price, estimated_duration, is_active")
    .eq("user_id", userId)
    .order("name", { ascending: true });

  return ((data || []) as Record<string, any>[]).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    default_price: row.default_price ?? null,
    estimated_duration: row.estimated_duration ?? null,
    is_active: row.is_active !== false,
  }));
}

export interface MarketplaceReview {
  id: string;
  customer_name: string | null;
  content: string | null;
  rating: number | null;
  created_at: string;
  provider_reply: string | null;
  provider_replied_at: string | null;
  status: string | null;
}

export async function fetchMarketplaceReviews(userId: string): Promise<MarketplaceReview[]> {
  const { data } = await supabase
    .from("testimonials")
    .select("id, customer_name, content, rating, created_at, provider_reply, provider_replied_at, status")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);

  return ((data || []) as Record<string, any>[]).map((row) => ({
    id: row.id,
    customer_name: row.customer_name ?? null,
    content: row.content ?? null,
    rating: row.rating ?? null,
    created_at: row.created_at,
    provider_reply: row.provider_reply ?? null,
    provider_replied_at: row.provider_replied_at ?? null,
    status: row.status ?? null,
  }));
}

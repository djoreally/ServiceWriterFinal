/** Public Booking Query — canonical API-first public booking reads. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { nextApi } from "@/lib/nextApiClient";
import { z } from "zod";
import { getCurrentAuthUser } from "@/lib/auth/current-user";

const canonicalSupabase = supabase as unknown as SupabaseClient;
const nullableString = z.string().nullable().optional();
const nullableNumber = z.number().nullable().optional();

const publicBookingProfileSchema = z.object({
  user_id: z.string().min(1), business_name: nullableString, phone: nullableString,
  email: nullableString, logo_url: nullableString, opening_time: nullableString,
  closing_time: nullableString, working_days: z.array(z.string()).nullable().optional(),
  currency: nullableString, service_radius_miles: nullableNumber, service_address: nullableString,
  service_coordinates: z.object({ lat: z.number(), lng: z.number() }).nullable().optional(),
  buffer_time_before: nullableNumber, buffer_time_after: nullableNumber,
  min_lead_time_hours: nullableNumber, max_advance_days: nullableNumber,
  slot_duration_minutes: nullableNumber, stripe_charges_enabled: z.boolean().optional(),
  oil_price_per_quart: nullableNumber, require_approval: z.boolean().optional(),
  weather_guard_enabled: z.boolean().optional(), weather_guard_settings: z.unknown().optional(),
}).passthrough();

const publicBusinessSettingsSchema = z.object({
  day_hours: z.record(z.string(), z.unknown()).nullable().optional(), payment_provider: nullableString,
  square_charges_enabled: z.boolean().optional(), square_merchant_id: nullableString,
  oil_price_per_quart: nullableNumber, waste_oil_fee_enabled: z.boolean().optional(), waste_oil_fee: nullableNumber,
  shop_fee_enabled: z.boolean().optional(), shop_fee_type: nullableString, shop_fee_value: nullableNumber,
  shop_fee_description: nullableString, surcharge_enabled: z.boolean().optional(), surcharge_type: nullableString,
  surcharge_value: nullableNumber, surcharge_description: nullableString, weather_guard_enabled: z.boolean().optional(),
  weather_guard_settings: z.unknown().optional(), service_verticals: z.array(z.string()).optional(),
}).passthrough();

const publicBlockedDatesSchema = z.array(z.object({ blocked_date: z.string() }));
export type PublicBookingProfileData = z.infer<typeof publicBookingProfileSchema>;
export type PublicBusinessExtendedSettings = z.infer<typeof publicBusinessSettingsSchema>;

export interface PublicSubscriptionPlan {
  id: string; name: string; description: string | null; price: number; billing_cycle: string;
  tier: string; features: string[]; badge_label: string | null; badge_color: string | null;
  highlight: boolean; cta_label: string; display_order: number;
}

export async function fetchPublicBookingProfile(slug: string) {
  try {
    const response = await nextApi.publicBooking.get(slug, "profile");
    return { data: [publicBookingProfileSchema.parse(response.data)], error: null as unknown };
  } catch (error) { return { data: null, error }; }
}

/** Retired owner-id fallback. Active booking settings are fetched by slug through the public API. */
export async function fetchBusinessFeeSettings(_userId: string) {
  return { data: null, error: null as unknown };
}

export async function fetchPublicServiceCatalog(bookingSlug: string) {
  try { const response = await nextApi.publicBooking.get(bookingSlug, "catalog"); return { data: response.data, error: null as unknown }; }
  catch (error) { return { data: null, error }; }
}

export async function fetchPublicServicePackages(bookingSlug: string) {
  try { const response = await nextApi.publicBooking.get(bookingSlug, "packages"); return { data: response.data, error: null as unknown }; }
  catch (error) { return { data: null, error }; }
}

export async function fetchPublicSubscriptionPlans(businessUserId: string) {
  const { data, error } = await supabase.from("subscription_plans")
    .select("id, user_id, name, description, price, billing_cycle, features, included_services, max_services_per_cycle, is_active, display_order, tier, stripe_product_id, stripe_price_id, price_min, price_max, badge_label, badge_color, highlight, cta_label, created_at, updated_at")
    .eq("user_id", businessUserId).eq("is_active", true).order("display_order", { ascending: true });
  if (error) return { data: null as null, error };
  const mapped: PublicSubscriptionPlan[] = (data || []).map((plan) => ({
    id: plan.id, name: plan.name, description: plan.description ?? null, price: plan.price ?? 0,
    billing_cycle: plan.billing_cycle || "monthly", tier: plan.tier ?? "custom",
    features: Array.isArray(plan.features) ? plan.features as string[] : [], display_order: plan.display_order ?? 0,
    badge_label: plan.badge_label ?? null, badge_color: plan.badge_color ?? null,
    highlight: plan.highlight ?? false, cta_label: plan.cta_label || "Subscribe Now",
  }));
  return { data: mapped, error: null as null };
}

export async function fetchBookedSlotsForDate(bookingSlug: string, dateStr: string) {
  try { const response = await nextApi.publicBooking.get(bookingSlug, "slots", dateStr); return { data: response.data, error: null as unknown }; }
  catch (error) { return { data: null as unknown, error }; }
}

/** Legacy realtime owner-id filtering is retired; availability refreshes through the canonical slots API. */
export function subscribeToAppointmentChanges(_businessUserId: string, _onPayload: (payload: unknown) => void) {
  return { channel: null, unsubscribe: () => undefined };
}

export async function calculateTax(body: Record<string, unknown>) {
  return supabase.functions.invoke("calculate-tax", { body });
}

/** Retired owner-id helper; blocked dates are fetched publicly by booking slug. */
export async function fetchBlockedDates(_userId: string) {
  return { data: null, error: null as unknown };
}

export async function fetchPublicBlockedDates(bookingSlug: string): Promise<string[]> {
  try {
    const { data } = await nextApi.publicBooking.get(bookingSlug, "blocked_dates");
    return publicBlockedDatesSchema.parse(data).map((row) => row.blocked_date);
  } catch (error) {
    console.warn("[fetchPublicBlockedDates] threw:", error);
    return [];
  }
}

export async function fetchPublicBusinessExtendedSettings(bookingSlug: string) {
  try {
    const response = await nextApi.publicBooking.get(bookingSlug, "settings");
    return { data: response.data == null ? null : publicBusinessSettingsSchema.parse(response.data), error: null as unknown };
  } catch (error) { return { data: null, error }; }
}

export async function fetchBookingCustomerAccount(_userId: string) {
  const linked = await canonicalSupabase.rpc("link_customer_portal_account_v1");
  if (linked.error) return { data: null, error: linked.error };
  const link = ((linked.data ?? []) as Array<{ customer_id: string; workspace_id: string }>)[0];
  if (!link) return { data: null, error: null };
  const { data, error } = await canonicalSupabase.from("customers")
    .select("first_name,last_name,phone").eq("id", link.customer_id).eq("workspace_id", link.workspace_id).maybeSingle();
  if (error || !data) return { data: null, error };
  const row = data as { first_name: string | null; last_name: string | null; phone: string | null };
  return { data: { full_name: [row.first_name, row.last_name].filter(Boolean).join(" ") || null, phone: row.phone }, error: null };
}

export async function fetchCurrentBookingUser() { return getCurrentAuthUser(); }

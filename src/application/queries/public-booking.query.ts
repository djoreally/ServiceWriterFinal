/**
 * Public Booking Query — read-only data access for the public booking page.
 * Anonymous booking data stays behind the versioned API boundary; signed-in
 * customer prefill uses the canonical customer_users link.
 */
import { supabase } from "@/integrations/supabase/client";
import { nextApi } from "@/lib/nextApiClient";
import { z } from "zod";
import { getCurrentAuthUser } from "@/lib/auth/current-user";

const nullableString = z.string().nullable().optional();
const nullableNumber = z.number().nullable().optional();

const publicBookingProfileSchema = z.object({
  user_id: z.string().min(1),
  business_name: nullableString,
  phone: nullableString,
  email: nullableString,
  logo_url: nullableString,
  opening_time: nullableString,
  closing_time: nullableString,
  working_days: z.array(z.string()).nullable().optional(),
  currency: nullableString,
  service_radius_miles: nullableNumber,
  service_address: nullableString,
  service_coordinates: z.object({ lat: z.number(), lng: z.number() }).nullable().optional(),
  buffer_time_before: nullableNumber,
  buffer_time_after: nullableNumber,
  min_lead_time_hours: nullableNumber,
  max_advance_days: nullableNumber,
  slot_duration_minutes: nullableNumber,
  stripe_charges_enabled: z.boolean().optional(),
  oil_price_per_quart: nullableNumber,
  require_approval: z.boolean().optional(),
  weather_guard_enabled: z.boolean().optional(),
  weather_guard_settings: z.unknown().optional(),
}).passthrough();

const publicBusinessSettingsSchema = z.object({
  day_hours: z.record(z.string(), z.unknown()).nullable().optional(),
  payment_provider: nullableString,
  square_charges_enabled: z.boolean().optional(),
  square_merchant_id: nullableString,
  oil_price_per_quart: nullableNumber,
  waste_oil_fee_enabled: z.boolean().optional(),
  waste_oil_fee: nullableNumber,
  shop_fee_enabled: z.boolean().optional(),
  shop_fee_type: nullableString,
  shop_fee_value: nullableNumber,
  shop_fee_description: nullableString,
  surcharge_enabled: z.boolean().optional(),
  surcharge_type: nullableString,
  surcharge_value: nullableNumber,
  surcharge_description: nullableString,
  weather_guard_enabled: z.boolean().optional(),
  weather_guard_settings: z.unknown().optional(),
  service_verticals: z.array(z.string()).optional(),
}).passthrough();

const publicBlockedDatesSchema = z.array(z.object({ blocked_date: z.string() }));

export type PublicBookingProfileData = z.infer<typeof publicBookingProfileSchema>;
export type PublicBusinessExtendedSettings = z.infer<typeof publicBusinessSettingsSchema>;

export interface PublicSubscriptionPlan {
  id: string;
  name: string;
  description: string | null;
  price: number;
  billing_cycle: string;
  tier: string;
  features: string[];
  badge_label: string | null;
  badge_color: string | null;
  highlight: boolean;
  cta_label: string;
  display_order: number;
}

/** Fetch business profile via the safe versioned public API. */
export async function fetchPublicBookingProfile(slug: string) {
  try {
    const response = await nextApi.publicBooking.get(slug, "profile");
    return { data: [publicBookingProfileSchema.parse(response.data)], error: null as unknown };
  } catch (error) {
    return { data: null, error };
  }
}

/** Fetch public service catalog for a business. */
export async function fetchPublicServiceCatalog(bookingSlug: string) {
  try {
    const response = await nextApi.publicBooking.get(bookingSlug, "catalog");
    return { data: response.data, error: null as unknown };
  } catch (error) {
    return { data: null, error };
  }
}

/** Fetch public service packages for a business. */
export async function fetchPublicServicePackages(bookingSlug: string) {
  try {
    const response = await nextApi.publicBooking.get(bookingSlug, "packages");
    return { data: response.data, error: null as unknown };
  } catch (error) {
    return { data: null, error };
  }
}

/**
 * Fetch the public-facing subscription plans for a specific business.
 * This legacy customer-subscription catalog remains keyed by the provider
 * owner id until that module is migrated; it is intentionally isolated here.
 */
export async function fetchPublicSubscriptionPlans(businessUserId: string) {
  const { data, error } = await supabase
    .from("subscription_plans")
    .select("id, user_id, name, description, price, billing_cycle, features, included_services, max_services_per_cycle, is_active, display_order, tier, stripe_product_id, stripe_price_id, price_min, price_max, badge_label, badge_color, highlight, cta_label, created_at, updated_at")
    .eq("user_id", businessUserId)
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  if (error) return { data: null as null, error };

  const mapped: PublicSubscriptionPlan[] = (data || []).map((plan) => ({
    id: plan.id,
    user_id: plan.user_id,
    name: plan.name,
    description: plan.description ?? null,
    price: plan.price ?? 0,
    billing_cycle: plan.billing_cycle || "monthly",
    tier: plan.tier ?? "custom",
    features: Array.isArray(plan.features) ? (plan.features as string[]) : [],
    included_services: Array.isArray(plan.included_services) ? (plan.included_services as string[]) : [],
    max_services_per_cycle: plan.max_services_per_cycle ?? null,
    is_active: plan.is_active ?? true,
    display_order: plan.display_order ?? 0,
    stripe_product_id: plan.stripe_product_id ?? null,
    stripe_price_id: plan.stripe_price_id ?? null,
    price_min: plan.price_min ?? null,
    price_max: plan.price_max ?? null,
    badge_label: plan.badge_label ?? null,
    badge_color: plan.badge_color ?? null,
    highlight: plan.highlight ?? false,
    cta_label: plan.cta_label || "Subscribe Now",
  }));

  return { data: mapped, error: null as null };
}

/** Fetch booked slots for a specific date through the audited public API. */
export async function fetchBookedSlotsForDate(bookingSlug: string, dateStr: string) {
  try {
    const response = await nextApi.publicBooking.get(bookingSlug, "slots", dateStr);
    return { data: response.data, error: null as unknown };
  } catch (error) {
    return { data: null as unknown, error };
  }
}

/** Invoke tax calculation edge function. */
export async function calculateTax(body: Record<string, unknown>) {
  return supabase.functions.invoke("calculate-tax", { body });
}

/** Anonymous read of the workspace-scoped blackout calendar. */
export async function fetchPublicBlockedDates(bookingSlug: string): Promise<string[]> {
  try {
    const { data } = await nextApi.publicBooking.get(bookingSlug, "blocked_dates");
    return publicBlockedDatesSchema.parse(data).map((row) => row.blocked_date);
  } catch (error) {
    console.warn("[fetchPublicBlockedDates] threw:", error);
    return [];
  }
}

/** Fetch extended business settings, including canonical per-day hours. */
export async function fetchPublicBusinessExtendedSettings(bookingSlug: string) {
  try {
    const response = await nextApi.publicBooking.get(bookingSlug, "settings");
    return {
      data: response.data == null ? null : publicBusinessSettingsSchema.parse(response.data),
      error: null as unknown,
    };
  } catch (error) {
    return { data: null, error };
  }
}

/**
 * Prefill a signed-in returning customer from canonical customer records.
 * The link RPC binds only records matching the authenticated JWT email; the
 * browser never queries the retired customer_accounts table.
 */
export async function fetchBookingCustomerAccount(userId: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user || session.user.id !== userId) return { data: null, error: null };

  const link = await (supabase as any).rpc("link_customer_portal_account_v1");
  if (link.error) return { data: null, error: link.error };

  const result = await (supabase as any)
    .from("customer_users")
    .select("is_primary,updated_at,customers(first_name,last_name,phone)")
    .eq("user_id", userId)
    .order("is_primary", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const customer = result.data?.customers;
  const row = Array.isArray(customer) ? customer[0] : customer;
  if (result.error || !row) return { data: null, error: result.error };
  return {
    data: {
      full_name: [row.first_name, row.last_name].filter(Boolean).join(" ").trim(),
      phone: row.phone ?? null,
    },
    error: null,
  };
}

/** Fetch the currently authenticated customer user (if present). */
export async function fetchCurrentBookingUser() {
  return getCurrentAuthUser();
}

/**
 * Public Booking Query — Read-only data access for the PublicBooking page.
 * Write operations have been moved to public-booking.command.ts.
 */
import { supabase } from "@/integrations/supabase/client";
import { apiClient, ApiClientError } from "@/lib/api-client";
import { z } from "zod";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

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

async function fetchPublicSection(slug: string, section: string, date?: string) {
  const { data } = await apiClient.get<{ data: unknown }>(
    `/v1/public-booking/${encodeURIComponent(slug)}`,
    { query: { section, ...(date ? { date } : {}) } },
  );
  return data;
}

export async function fetchPublicBookingProfile(slug: string) {
  try {
    const data = await fetchPublicSection(slug, "profile");
    return { data: [publicBookingProfileSchema.parse(data)], error: null as unknown };
  } catch (error) {
    return { data: null, error };
  }
}

export async function fetchBusinessFeeSettings(userId: string) {
  return apiClient.get<{ data: unknown; error: unknown }>(
    "/v1/platform/public-booking/fee-settings",
    { query: { user_id: userId } },
  );
}

export async function fetchPublicServiceCatalog(bookingSlug: string) {
  try {
    const data = await fetchPublicSection(bookingSlug, "catalog");
    return { data, error: null as unknown };
  } catch (error) {
    return { data: null, error };
  }
}

export async function fetchPublicServicePackages(bookingSlug: string) {
  try {
    const data = await fetchPublicSection(bookingSlug, "packages");
    return { data, error: null as unknown };
  } catch (error) {
    return { data: null, error };
  }
}

export async function fetchPublicSubscriptionPlans(businessUserId: string) {
  const { data, error } = await apiClient.get<{ data: any[] | null; error: unknown }>(
    "/v1/platform/public-booking/subscription-plans",
    { query: { user_id: businessUserId } },
  );
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

export async function fetchBookedSlotsForDate(bookingSlug: string, dateStr: string) {
  try {
    const data = await fetchPublicSection(bookingSlug, "slots", dateStr);
    return { data, error: null as unknown };
  } catch (error) {
    return { data: null as unknown, error };
  }
}

export async function fetchCanonicalAvailability(bookingSlug: string, dateStr: string) {
  try {
    const data = await fetchPublicSection(bookingSlug, "slots", dateStr);
    const parsed = z.object({
      canonical_availability: z.literal(true),
      localDate: z.string(),
      bookingEnabled: z.boolean(),
      defaultSlotMinutes: z.number(),
      slots: z.array(z.object({ time: z.string(), start_minute: z.number(), end_minute: z.number() })),
    }).parse(data);
    return { data: parsed, error: null as unknown };
  } catch (error) {
    return { data: null, error };
  }
}

export function subscribeToAppointmentChanges(
  businessUserId: string,
  onPayload: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void,
) {
  const channel = supabase
    .channel('appointments-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `user_id=eq.${businessUserId}` }, onPayload)
    .subscribe();
  return { channel, unsubscribe: () => supabase.removeChannel(channel) };
}

export async function calculateTax(body: Record<string, unknown>) {
  try {
    const { data } = await apiClient.post<{ data: unknown }>("/v1/platform/public-booking/calculate-tax", body);
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error instanceof ApiClientError ? new Error(error.message) : error };
  }
}

export async function fetchBlockedDates(userId: string) {
  return apiClient.get<{ data: unknown; error: unknown }>("/v1/platform/public-booking/blocked-dates", { query: { user_id: userId } });
}

export async function fetchPublicBlockedDates(bookingSlug: string): Promise<string[]> {
  try {
    const data = await fetchPublicSection(bookingSlug, "blocked_dates");
    return publicBlockedDatesSchema.parse(data).map((row) => row.blocked_date);
  } catch (e) {
    console.warn("[fetchPublicBlockedDates] threw:", e);
    return [];
  }
}

export async function fetchPublicBusinessExtendedSettings(bookingSlug: string) {
  try {
    const data = await fetchPublicSection(bookingSlug, "settings");
    return { data: data == null ? null : publicBusinessSettingsSchema.parse(data), error: null as unknown };
  } catch (error) {
    return { data: null, error };
  }
}

export async function fetchBookingCustomerAccount(userId: string) {
  return apiClient.get<{ data: { full_name: string | null; phone: string | null } | null; error: unknown }>(
    "/v1/platform/public-booking/customer-account",
    { query: { user_id: userId } },
  );
}

export async function fetchCurrentBookingUser() {
  return getCurrentAuthUser();
}

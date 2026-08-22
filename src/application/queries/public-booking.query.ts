/**
 * Public Booking Query — Read-only data access for the PublicBooking page.
 * Write operations have been moved to public-booking.command.ts.
 */
import { supabase } from "@/integrations/supabase/client";
import { nextApi } from "@/lib/nextApiClient";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
/** Fetch business profile via the safe versioned public RPC. */
export async function fetchPublicBookingProfile(slug: string) {
  try {
    const response = await nextApi.publicBooking.get(slug, "profile");
    return { data: [response.data], error: null as unknown };
  } catch (error) {
    return { data: null as unknown, error };
  }
}

/** Fetch additional business settings (fees, payment provider, etc.). */
export async function fetchBusinessFeeSettings(userId: string) {
  return (supabase
    .from("business_profiles")
    .select("oil_price_per_quart, waste_oil_fee_enabled, waste_oil_fee, shop_fee_enabled, shop_fee_type, shop_fee_value, shop_fee_description, surcharge_enabled, surcharge_type, surcharge_value, surcharge_description, payment_provider") as any)
    .eq("user_id", userId)
    .single() as { data: any | null; error: any };
}

/**
 * Fetch public service catalog for a business.
 *
 * Resilience: some backends may not yet expose the v2 catalog RPC (schema drift).
 * When v2 is unavailable we fall back to the v1 catalog so guests still see the
 * individual services instead of packages only.
 */
export async function fetchPublicServiceCatalog(bookingSlug: string) {
  try {
    const response = await nextApi.publicBooking.get(bookingSlug, "catalog");
    return { data: response.data, error: null as unknown };
  } catch (error) {
    return { data: null as unknown, error };
  }
}


/** Fetch public service packages for a business. */
export async function fetchPublicServicePackages(bookingSlug: string) {
  try {
    const response = await nextApi.publicBooking.get(bookingSlug, "packages");
    return { data: response.data, error: null as unknown };
  } catch (error) {
    return { data: null as unknown, error };
  }
}

/**
 * Fetch the public-facing subscription plans for a specific business.
 *
 * IMPORTANT: This must read from `subscription_plans` (the shop-owner-managed,
 * tenant-scoped table) — NOT from `platform_plans` (the global SaaS pricing
 * tiers Free/Pro/Business). Reading platform_plans here caused every shop's
 * public booking + subscriptions page to display the same Lovable platform
 * tiers instead of the shop's own customer-facing plans.
 */
export async function fetchPublicSubscriptionPlans(businessUserId: string) {
  const { data, error } = await supabase
    .from("subscription_plans")
    .select(
      "id, user_id, name, description, price, billing_cycle, features, included_services, max_services_per_cycle, is_active, display_order, tier, stripe_product_id, stripe_price_id, price_min, price_max, badge_label, badge_color, highlight, cta_label, created_at, updated_at",
    )
    .eq("user_id", businessUserId)
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  if (error) return { data: null as null, error };

  const mapped = (data || []).map((plan: any) => ({
    id: plan.id,
    user_id: plan.user_id,
    name: plan.name,
    description: plan.description ?? null,
    price: plan.price ?? 0,
    billing_cycle: plan.billing_cycle || "monthly",
    tier: plan.tier ?? "custom",
    features: Array.isArray(plan.features) ? (plan.features as string[]) : [],
    included_services: Array.isArray(plan.included_services)
      ? (plan.included_services as string[])
      : [],
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

/** Fetch booked slots for a specific date. */
export async function fetchBookedSlotsForDate(bookingSlug: string, dateStr: string) {
  try {
    const response = await nextApi.publicBooking.get(bookingSlug, "slots", dateStr);
    return { data: response.data, error: null as unknown };
  } catch (error) {
    return { data: null as unknown, error };
  }
}

/** Subscribe to appointment changes for a business (realtime). */
export function subscribeToAppointmentChanges(
  businessUserId: string,
  onPayload: (payload: any) => void,
) {
  const channel = supabase
    .channel('appointments-realtime')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'appointments',
        filter: `user_id=eq.${businessUserId}`,
      },
      onPayload,
    )
    .subscribe();

  return { channel, unsubscribe: () => supabase.removeChannel(channel) };
}

/** Invoke tax calculation edge function. */
export async function calculateTax(body: Record<string, unknown>): Promise<any> {
  return supabase.functions.invoke("calculate-tax", { body });
}

/** Insert blocked date record. */
export async function fetchBlockedDates(userId: string) {
  return supabase.from("blocked_dates").select("blocked_date").eq("user_id", userId);
}

/**
 * Public-facing read of a business's blocked dates (via SECURITY DEFINER RPC).
 * Anonymous bookers need this to see which dates the business has marked unavailable.
 * Returns ISO date strings (YYYY-MM-DD).
 */
export async function fetchPublicBlockedDates(bookingSlug: string): Promise<string[]> {
  try {
    // Pass both params to disambiguate overloaded RPC (1-arg vs 2-arg variants).
    // Without this, PostgREST returns PGRST203 and the picker silently shows blocked days as bookable.
    const { data } = await nextApi.publicBooking.get(bookingSlug, "blocked_dates");
    return ((data as any[]) ?? [])
      .map((row) => (typeof row?.blocked_date === "string" ? row.blocked_date : null))
      .filter((d): d is string => !!d);
  } catch (e) {
    console.warn("[fetchPublicBlockedDates] threw:", e);
    return [];
  }
}

/** Fetch extended business settings (fees, payment provider, square, weather guard). */
export async function fetchPublicBusinessExtendedSettings(userId: string) {
  try {
    const response = await nextApi.publicBooking.get(userId, "settings");
    return { data: (response.data ?? null) as Record<string, unknown> | null, error: null as unknown };
  } catch (error) {
    return { data: null as unknown, error };
  }
}

/** Fetch a customer account profile (name + phone) for the logged-in user. */
export async function fetchBookingCustomerAccount(userId: string) {
  return supabase
    .from("customer_accounts")
    .select("full_name, phone")
    .eq("user_id", userId)
    .maybeSingle();
}

/** Fetch the currently authenticated customer user (if present). */
export async function fetchCurrentBookingUser() {
  return getCurrentAuthUser();
}

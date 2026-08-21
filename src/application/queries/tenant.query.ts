/**
 * Tenant Query - Read operations for tenant/business profile data
 */

import { supabase } from "@/integrations/supabase/client";
import { resolveOilPricePerQuart } from "@/lib/oilPricing";
import { isReservedSubdomain } from "@/lib/reserved-subdomains";


const TENANT_ROOT_DOMAIN = "servicewriter.xyz";
const NON_TENANT_HOSTS = new Set(["localhost", "127.0.0.1", TENANT_ROOT_DOMAIN, `www.${TENANT_ROOT_DOMAIN}`]);

export type TenantSource = "route" | "subdomain";

export interface TenantResolution {
  resolved: boolean;
  tenant?: {
    slug: string;
    source: TenantSource;
  };
}

export interface TenantProfileData {
  user_id: string;
  business_name: string | null;
  email: string | null;
  phone: string | null;
  opening_time: string | null;
  closing_time: string | null;
  working_days: string[] | null;
  currency: string | null;
  service_radius_miles: number | null;
  service_address: string | null;
  service_coordinates: { lat: number; lng: number } | null;
  logo_url: string | null;
  buffer_time_before: number;
  buffer_time_after: number;
  min_lead_time_hours: number;
  max_advance_days: number;
  slot_duration_minutes: number;
  /** ⚡ Security: boolean only — stripe_account_id is never exposed to the client */
  stripe_charges_enabled: boolean;
  google_review_url: string | null;
  yelp_review_url: string | null;
  oil_price_per_quart: number;
}

function normalizeBookingSlug(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  // Same slug shape used in settings validation and public booking URLs.
  if (!/^[a-z0-9-]+$/.test(normalized)) {
    return null;
  }

  return normalized;
}

export function resolveTenant(routeSlug?: string): TenantResolution {
  const normalizedRouteSlug = normalizeBookingSlug(routeSlug);
  if (normalizedRouteSlug) {
    return {
      resolved: true,
      tenant: {
        slug: normalizedRouteSlug,
        source: "route",
      },
    };
  }

  if (typeof window === "undefined") {
    return { resolved: false };
  }

  const host = window.location.hostname.toLowerCase().trim();
  if (!host || NON_TENANT_HOSTS.has(host)) {
    return { resolved: false };
  }

  // Only official production subdomains are treated as tenant contexts.
  if (!host.endsWith(`.${TENANT_ROOT_DOMAIN}`)) {
    return { resolved: false };
  }

  const slugCandidate = host.slice(0, -1 * (`.${TENANT_ROOT_DOMAIN}`.length));
  const normalizedSubdomainSlug = normalizeBookingSlug(slugCandidate);
  // Infrastructure hosts (auth.*, app.*, api.* …) are never tenants. The OAuth
  // consent host depends on this: auth.servicewriter.xyz must render the app's
  // normal routes, not the tenant booking catch-all.
  if (!normalizedSubdomainSlug || isReservedSubdomain(normalizedSubdomainSlug)) {
    return { resolved: false };
  }


  return {
    resolved: true,
    tenant: {
      slug: normalizedSubdomainSlug,
      source: "subdomain",
    },
  };
}

/**
 * Fetch tenant profile by booking slug.
 * Uses the allow-listed get_public_booking_profile_v2 RPC exclusively — no raw business_profiles query.
 * stripe_account_id is never returned to the client; the RPC computes
 * stripe_charges_enabled as (charges_enabled AND account_id IS NOT NULL).
 */
export async function fetchTenantProfile(bookingSlug: string): Promise<TenantProfileData | null> {
  const { data: profileData, error: profileError } = await supabase.rpc(
    "get_public_booking_profile_v2",
    { booking_slug_param: bookingSlug }
  );

  // A transport/backend failure is NOT "shop not found". Collapsing both into
  // null made booking links fall back to the marketing homepage whenever the
  // backend timed out. Throw so callers can offer a retry instead.
  if (profileError) {
    throw new Error(profileError.message || "Failed to load booking profile");
  }

  if (!profileData || profileData.length === 0) {
    return null;
  }

  const profile = profileData[0];

  return {
    user_id: profile.user_id,
    business_name: profile.business_name,
    email: profile.email || null,
    phone: profile.phone || null,
    opening_time: profile.opening_time,
    closing_time: profile.closing_time,
    working_days: profile.working_days,
    currency: profile.currency,
    service_radius_miles: profile.service_radius_miles,
    service_address: profile.service_address,
    service_coordinates: profile.service_coordinates as { lat: number; lng: number } | null,
    logo_url: profile.logo_url,
    buffer_time_before: profile.buffer_time_before ?? 0,
    buffer_time_after: profile.buffer_time_after ?? 0,
    min_lead_time_hours: profile.min_lead_time_hours ?? 2,
    max_advance_days: profile.max_advance_days ?? 30,
    slot_duration_minutes: profile.slot_duration_minutes ?? 30,
    stripe_charges_enabled: profile.stripe_charges_enabled || false,
    google_review_url: profile.google_review_url || null,
    yelp_review_url: profile.yelp_review_url || null,
    oil_price_per_quart: resolveOilPricePerQuart(profile.oil_price_per_quart),
  };
}

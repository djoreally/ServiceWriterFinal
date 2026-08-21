/**
 * Settings Query - Application layer for settings data fetching
 */

import { supabase } from "@/integrations/supabase/client";
import type { Terminology } from "@/contexts/TerminologyContext";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface BusinessProfileSettings {
  id?: string;
  user_id: string;
  business_name: string;
  owner_name: string;
  phone: string;
  email: string;
  address: string;
  logo_url: string;
  terminology: Terminology;
  date_format: string;
  timezone: string;
  currency: string;
  opening_time: string;
  closing_time: string;
  working_days: string[];
  booking_slug: string;
  service_radius_miles: number;
  service_address: string;
  service_coordinates: { lat: number; lng: number } | null;
}

const DEFAULT_PROFILE: Omit<BusinessProfileSettings, 'user_id'> = {
  business_name: "",
  owner_name: "",
  phone: "",
  email: "",
  address: "",
  logo_url: "",
  terminology: {
    customer: "Customer",
    vehicle: "Vehicle",
    service: "Service",
    quote: "Quote",
  },
  date_format: "DD/MM/YYYY HH:mm",
  timezone: "UTC",
  currency: "GHS",
  opening_time: "08:00",
  closing_time: "17:00",
  working_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  booking_slug: "",
  service_radius_miles: 25,
  service_address: "",
  service_coordinates: null,
};

/**
 * Fetch business profile settings for the current user
 */
export async function fetchBusinessSettings(): Promise<BusinessProfileSettings | null> {
  try {
    const { data: { user } } = await getCurrentAuthUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from("business_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !data) return null;

    // Parse terminology safely
    const terminology = data.terminology && typeof data.terminology === "object" && !Array.isArray(data.terminology)
      ? {
          customer: typeof (data.terminology as Record<string, unknown>).customer === "string"
            ? (data.terminology as Record<string, unknown>).customer as string
            : "Customer",
          vehicle: typeof (data.terminology as Record<string, unknown>).vehicle === "string"
            ? (data.terminology as Record<string, unknown>).vehicle as string
            : "Vehicle",
          service: typeof (data.terminology as Record<string, unknown>).service === "string"
            ? (data.terminology as Record<string, unknown>).service as string
            : "Service",
          quote: typeof (data.terminology as Record<string, unknown>).quote === "string"
            ? (data.terminology as Record<string, unknown>).quote as string
            : "Quote",
        }
      : DEFAULT_PROFILE.terminology;

    return {
      id: data.id,
      user_id: data.user_id,
      business_name: data.business_name || "",
      owner_name: data.owner_name || "",
      phone: data.phone || "",
      email: data.email || "",
      address: data.address || "",
      logo_url: data.logo_url || "",
      terminology,
      date_format: data.date_format || DEFAULT_PROFILE.date_format,
      timezone: data.timezone || DEFAULT_PROFILE.timezone,
      currency: data.currency || DEFAULT_PROFILE.currency,
      opening_time: data.opening_time || DEFAULT_PROFILE.opening_time,
      closing_time: data.closing_time || DEFAULT_PROFILE.closing_time,
      working_days: data.working_days || DEFAULT_PROFILE.working_days,
      booking_slug: data.booking_slug || "",
      service_radius_miles: data.service_radius_miles || DEFAULT_PROFILE.service_radius_miles,
      service_address: data.service_address || "",
      service_coordinates: data.service_coordinates as { lat: number; lng: number } | null,
    };
  } catch {
    return null;
  }
}

/**
 * Save business profile settings
 */
export async function saveBusinessSettings(
  profile: BusinessProfileSettings,
  slugInput: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { user } } = await getCurrentAuthUser();
    if (!user) return { success: false, error: "Not authenticated" };

    const profileData = {
      business_name: profile.business_name,
      owner_name: profile.owner_name,
      phone: profile.phone,
      email: profile.email,
      address: profile.address,
      logo_url: profile.logo_url,
      terminology: JSON.parse(JSON.stringify(profile.terminology)),
      date_format: profile.date_format,
      timezone: profile.timezone,
      currency: profile.currency,
      opening_time: profile.opening_time,
      closing_time: profile.closing_time,
      working_days: profile.working_days,
      booking_slug: slugInput || profile.booking_slug || null,
      service_radius_miles: profile.service_radius_miles,
      service_address: profile.service_address,
      service_coordinates: profile.service_coordinates,
    };

    const { error } = await supabase
      .from("business_profiles")
      .update(profileData)
      .eq("user_id", user.id);

    if (error) {
      if (error.message?.includes("unique") || error.message?.includes("duplicate")) {
        return { success: false, error: "This booking link is already taken. Please choose another." };
      }
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    if (err?.message?.includes('already taken') || err?.details?.booking_slug) {
      return { success: false, error: "This booking link is already taken. Please choose another." };
    }
    return { success: false, error: "Failed to save profile" };
  }
}

/**
 * Check if a booking slug is available
 */
export async function checkSlugAvailability(slug: string): Promise<boolean | null> {
  if (!slug || slug.length < 3) {
    return null;
  }

  const validSlug = /^[a-z0-9-]+$/.test(slug);
  if (!validSlug) {
    return false;
  }

  try {
    const { data: { user } } = await getCurrentAuthUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from("business_profiles")
      .select("id")
      .eq("booking_slug", slug)
      .neq("user_id", user.id)
      .maybeSingle();

    if (error) return null;
    // Available if no other user has this slug
    return data === null;
  } catch {
    return null;
  }
}

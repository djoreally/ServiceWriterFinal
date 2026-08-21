/**
 * Booking Query - Application layer for booking data fetching
 * 
 * Centralizes all booking-related Supabase calls for the public booking flow.
 */

import { supabase } from "@/integrations/supabase/client";
import { resolveOilPricePerQuart } from "@/lib/oilPricing";

export interface BookingBusinessProfile {
  id: string;
  user_id: string;
  business_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  logo_url: string | null;
  opening_time: string | null;
  closing_time: string | null;
  working_days: string[] | null;
  currency: string | null;
  service_radius_miles: number | null;
  service_address: string | null;
  service_coordinates: { lat: number; lng: number } | null;
  buffer_time_before: number;
  buffer_time_after: number;
  min_lead_time_hours: number;
  max_advance_days: number;
  slot_duration_minutes: number;
  /** ⚡ Security: boolean only — stripe_account_id is never exposed to the client */
  stripe_charges_enabled: boolean;
  oil_price_per_quart: number;
}

export interface BookedSlot {
  scheduled_time: string;
  duration_minutes: number;
}

export interface ServicePackageItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
}

export interface ServicePackage {
  id: string;
  name: string;
  description: string | null;
  package_price: number;
  discount_type: string;
  discount_value: number;
  estimated_duration: number | null;
  services: ServicePackageItem[];
}

/**
 * Fetch business profile for public booking.
 * Uses the safe get_public_booking_profile_v2 RPC exclusively — no raw business_profiles query.
 */
export async function fetchBookingProfile(slug: string): Promise<BookingBusinessProfile | null> {
  const { data: businessData, error: businessError } = await supabase
    .rpc("get_public_booking_profile_v2", { booking_slug_param: slug });

  if (businessError || !businessData || businessData.length === 0) {
    return null;
  }

  const profile = businessData[0];

  return {
    id: '',
    user_id: profile.user_id,
    business_name: profile.business_name,
    phone: profile.phone || null,
    email: profile.email || null,
    address: null,
    logo_url: profile.logo_url || null,
    opening_time: profile.opening_time,
    closing_time: profile.closing_time,
    working_days: profile.working_days,
    currency: profile.currency,
    service_radius_miles: profile.service_radius_miles,
    service_address: profile.service_address,
    service_coordinates: profile.service_coordinates as { lat: number; lng: number } | null,
    buffer_time_before: profile.buffer_time_before ?? 0,
    buffer_time_after: profile.buffer_time_after ?? 0,
    min_lead_time_hours: profile.min_lead_time_hours ?? 2,
    max_advance_days: profile.max_advance_days ?? 30,
    slot_duration_minutes: profile.slot_duration_minutes ?? 30,
    stripe_charges_enabled: profile.stripe_charges_enabled || false,
    oil_price_per_quart: resolveOilPricePerQuart(profile.oil_price_per_quart),
  };
}

/**
 * Fetch service packages for a business
 */
export async function fetchServicePackages(businessUserId: string): Promise<ServicePackage[]> {
  const { data: packagesData, error } = await supabase
    .rpc("get_public_service_packages", { business_user_id: businessUserId });

  if (error || !packagesData) {
    console.error("[fetchServicePackages] Error:", error);
    return [];
  }

  return packagesData.map((p: Record<string, unknown>) => ({
    id: p.id as string,
    name: p.name as string,
    description: p.description as string | null,
    package_price: p.package_price as number,
    discount_type: p.discount_type as string,
    discount_value: p.discount_value as number,
    estimated_duration: p.estimated_duration as number | null,
    services: (p.services as ServicePackageItem[]) || [],
  }));
}

/**
 * Fetch booked slots for a specific date
 */
export async function fetchBookedSlots(
  businessUserId: string, 
  bookingDate: string
): Promise<BookedSlot[]> {
  const { data, error } = await supabase.rpc("get_booked_slots", {
    business_user_id: businessUserId,
    booking_date: bookingDate,
  });

  if (error || !data) {
    console.error("[fetchBookedSlots] Error:", error);
    return [];
  }

  return data as BookedSlot[];
}

/**
 * Subscribe to real-time appointment changes
 */
export function subscribeToAppointments(
  businessUserId: string,
  onUpdate: (payload: { eventType: string; new: Record<string, unknown> | null; old: Record<string, unknown> | null }) => void
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
      (payload) => {
        onUpdate({
          eventType: payload.eventType,
          new: payload.new as Record<string, unknown> | null,
          old: payload.old as Record<string, unknown> | null,
        });
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

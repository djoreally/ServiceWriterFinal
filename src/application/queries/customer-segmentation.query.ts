/**
 * Customer Segmentation Query — Read operations for customer segments.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface SegmentRow {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  min_lifetime_value: number | null;
  max_lifetime_value: number | null;
  min_total_services: number | null;
  max_total_services: number | null;
  min_days_since_service: number | null;
  max_days_since_service: number | null;
  min_average_order: number | null;
  max_average_order: number | null;
  is_auto: boolean;
  priority: number;
  auto_follow_up_days: number | null;
  is_active: boolean;
  member_count: number;
  last_calculated_at: string | null;
  calculation_status: "stale" | "calculating" | "current" | "failed";
  calculation_started_at: string | null;
  calculation_error: string | null;
  geo_center_lat: number | null;
  geo_center_lng: number | null;
  geo_radius_miles: number | null;
}

export interface LocationDemographicCustomer {
  id: string;
  name: string;
  address: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  lifetime_value: number | null;
  total_services: number | null;
}

export async function getCurrentUserId(): Promise<string | null> {
  const { data: { user } } = await getCurrentAuthUser();
  return user?.id ?? null;
}

export async function fetchSegments(userId: string) {
  const { data, error } = await supabase
    .from("customer_segments")
    .select("*")
    .eq("user_id", userId)
    .order("priority", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SegmentRow[];
}

export async function fetchLocationDemographicCustomers(userId: string) {
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, address, postal_code, latitude, longitude, lifetime_value, total_services")
    .eq("user_id", userId)
    .is("deleted_at", null);
  if (error) throw error;
  return (data ?? []) as LocationDemographicCustomer[];
}

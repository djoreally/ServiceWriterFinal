/**
 * CARFAX Query - Read operations for CARFAX settings and exports.
 */

import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface CarfaxSettingsData {
  carfax_location_id: string;
  city: string;
  state: string;
  postal_code: string;
  website_url: string;
  business_name: string;
  address: string;
  phone: string;
  carfax_activated?: boolean;
  carfax_activation_date?: string | null;
}


export interface CarfaxExportRecord {
  id: string;
  export_type: string;
  file_name: string;
  record_count: number;
  export_date: string;
  status: string;
  created_at: string;
}

export interface CarfaxDataStats {
  totalServices: number;
  validVins: number;
  missingData: number;
}

export async function fetchCarfaxSettings(): Promise<CarfaxSettingsData | null> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return null;

  const { data } = await supabase
    .from("business_profiles")
    .select("carfax_location_id, city, state, postal_code, website_url, business_name, address, phone")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) return null;
  return {
    carfax_location_id: data.carfax_location_id || "",
    city: data.city || "",
    state: data.state || "",
    postal_code: data.postal_code || "",
    website_url: data.website_url || "",
    business_name: data.business_name || "",
    address: data.address || "",
    phone: data.phone || "",
    carfax_activated: Boolean(data.carfax_location_id),
    carfax_activation_date: null,
  };


}


export async function fetchCarfaxExports(): Promise<CarfaxExportRecord[]> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return [];

  const { data } = await supabase
    .from("carfax_exports")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  return (data ?? []) as CarfaxExportRecord[];
}

export async function fetchCarfaxDataStats(): Promise<CarfaxDataStats> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return { totalServices: 0, validVins: 0, missingData: 0 };

  // ⚡ Parallel fetch: count and VIN check run concurrently
  const [countRes, vehicleRes] = await Promise.all([
    supabase
      .from("services")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "completed"),
    supabase
      .from("services")
      .select("id, vehicle_id, vehicles!inner(vin)")
      .eq("user_id", user.id)
      .eq("status", "completed")
      .not("vehicle_id", "is", null),
  ]);

  const totalServices = countRes.count || 0;
  const validVins = vehicleRes.data?.filter(
    (service: { vehicles?: { vin?: string | null } | null }) => service.vehicles?.vin?.length === 17
  ).length || 0;

  return { totalServices, validVins, missingData: totalServices - validVins };
}

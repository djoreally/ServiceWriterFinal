/**
 * Fleet Map Query - Read operations for the Fleet Command Map
 *
 * Replaces direct supabase.from() calls in Fleet.tsx fetchMapData
 */

import { apiClient } from '@/lib/api-client';

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface FleetMapVan {
  id: string;
  name: string;
  status: string;
  color: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  license_plate: string | null;
  zipCodes: { zip_code: string; is_primary: boolean }[];
  technician: {
    id: string;
    name: string;
    status: string;
    current_location: { lat: number; lng: number } | null;
  } | null;
  currentLocation: { lat: number; lng: number } | null;
  todayJobCount: number;
}

/** Fetch enriched map data: vans + territories + technician GPS + today job counts */
export async function fetchFleetMapData(): Promise<FleetMapVan[]> {
  const {
    data: { user },
  } = await getCurrentAuthUser();
  if (!user) return [];

  const { data } = await apiClient.get<{ data: FleetMapVan[] }>("/v1/fleet/map-data");
  return data ?? [];
}

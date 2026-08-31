/**
 * Fleet Map Query - Read operations for the Fleet Command Map
 *
 * Replaces direct supabase.from() calls in Fleet.tsx fetchMapData
 */

import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

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

type TechnicianRow = Pick<
  Database["public"]["Tables"]["technicians"]["Row"],
  "id" | "name" | "status" | "current_location" | "avatar_url"
>;

function coordinates(value: unknown): { lat: number; lng: number } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const point = value as Record<string, unknown>;
  return typeof point.lat === "number" && typeof point.lng === "number"
    ? { lat: point.lat, lng: point.lng }
    : null;
}

/** Fetch enriched map data: vans + territories + technician GPS + today job counts */
export async function fetchFleetMapData(): Promise<FleetMapVan[]> {
  const {
    data: { user },
  } = await getCurrentAuthUser();
  if (!user) return [];

  const today = new Date().toISOString().slice(0, 10);

  const [vansRes, territoriesRes, techsRes, jobsRes] = await Promise.all([
    supabase
      .from('vans')
      .select('id, name, status, color, make, model, year, license_plate, assigned_technician_id')
      .eq('user_id', user.id)
      .eq('is_active', true),
    supabase.from('van_territories').select('van_id, zip_code, is_primary'),
    supabase
      .from('technicians')
      .select('id, name, status, current_location, avatar_url')
      .eq('user_id', user.id)
      .eq('is_active', true),
    supabase
      .from('appointments')
      .select('id, assigned_van_id')
      .eq('user_id', user.id)
      .eq('scheduled_date', today)
      .not('status', 'in', '("cancelled","completed")'),
  ]);

  const vansData = vansRes.data;
  if (!vansData) return [];

  const techsData = techsRes.data ?? [];
  const techMap = new Map<string, TechnicianRow>();
  techsData.forEach((t) => {
    techMap.set(t.id, t);
  });

  const territoryMap: Record<string, { zip_code: string; is_primary: boolean }[]> = {};
  (territoriesRes.data ?? []).forEach((t) => {
    if (!territoryMap[t.van_id]) territoryMap[t.van_id] = [];
    territoryMap[t.van_id].push({ zip_code: t.zip_code, is_primary: t.is_primary === true });
  });

  const jobCountMap: Record<string, number> = {};
  (jobsRes.data ?? []).forEach((j) => {
    const vid = j.assigned_van_id;
    if (vid) jobCountMap[vid] = (jobCountMap[vid] || 0) + 1;
  });

  return vansData.map((van) => {
    const tech = van.assigned_technician_id ? techMap.get(van.assigned_technician_id) ?? null : null;
    const rawLoc = coordinates(tech?.current_location);
    return {
      id: van.id,
      name: van.name,
      status: van.status,
      color: van.color ?? null,
      make: van.make ?? null,
      model: van.model ?? null,
      year: van.year ?? null,
      license_plate: van.license_plate ?? null,
      zipCodes: territoryMap[van.id] || [],
      technician: tech
        ? {
            id: tech.id,
            name: tech.name,
            status: tech.status,
            current_location: rawLoc,
          }
        : null,
      currentLocation: null as { lat: number; lng: number } | null,
      todayJobCount: jobCountMap[van.id] || 0,
    };
  });
}

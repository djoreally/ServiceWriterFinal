/**
 * Fleet Map Query - Read operations for the Fleet Command Map
 *
 * Replaces direct supabase.from() calls in Fleet.tsx fetchMapData
 */

import { supabase } from '@/integrations/supabase/client';

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

  const vansData = vansRes.data as any[] | null;
  if (!vansData) return [];

  const techsData = (techsRes.data || []) as any[];
  const techMap: Record<string, any> = {};
  techsData.forEach((t) => {
    techMap[t.id] = t;
  });

  const territoryMap: Record<string, { zip_code: string; is_primary: boolean }[]> = {};
  ((territoriesRes.data || []) as any[]).forEach((t: any) => {
    if (!territoryMap[t.van_id]) territoryMap[t.van_id] = [];
    territoryMap[t.van_id].push({ zip_code: t.zip_code, is_primary: t.is_primary });
  });

  const jobCountMap: Record<string, number> = {};
  ((jobsRes.data || []) as any[]).forEach((j: any) => {
    const vid = j.assigned_van_id as string | null;
    if (vid) jobCountMap[vid] = (jobCountMap[vid] || 0) + 1;
  });

  return vansData.map((van: any) => {
    const tech = van.assigned_technician_id ? techMap[van.assigned_technician_id] : null;
    const rawLoc: { lat: number; lng: number } | null = tech?.current_location ?? null;
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

/**
 * Dispatch Runs Queries — Phase 3
 *
 * Read operations for route sequencing and dispatch run data.
 */

import { supabase } from '@/integrations/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────

export interface DispatchRunSummary {
  id: string;
  technicianId: string;
  technicianName: string;
  vanId: string | null;
  vanName: string | null;
  runDate: string;
  status: string;
  stopCount: number;
  totalDistanceMeters: number | null;
  totalTravelTimeSeconds: number | null;
}

export interface RouteStopDetail {
  id: string;
  sequenceOrder: number;
  status: string;
  workOrderId: string;
  workOrderNumber: string;
  customerName: string | null;
  locationAddress: string | null;
  locationLat: number | null;
  locationLng: number | null;
  estimatedArrival: string | null;
  estimatedDurationMinutes: number | null;
  actualArrival: string | null;
  actualDeparture: string | null;
  distanceToNextMeters: number | null;
  travelTimeToNextSeconds: number | null;
}

// ─── Queries ──────────────────────────────────────────────────────────────

/** Fetch all dispatch runs for a user on a given date. */
export const fetchDispatchRuns = async (
  userId: string,
  date: string
): Promise<DispatchRunSummary[]> => {
  const { data, error } = await supabase
    .from('dispatch_runs')
    .select(`
      id,
      technician_id,
      van_id,
      run_date,
      status,
      total_distance_meters,
      total_travel_time_seconds,
      technicians!inner(name),
      vans(name)
    `)
    .eq('user_id', userId)
    .eq('run_date', date)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to fetch dispatch runs: ${error.message}`);

  // Fetch stop counts in a single query
  const runIds = (data ?? []).map(r => r.id);
  const stopCounts = new Map<string, number>();
  if (runIds.length > 0) {
    const { data: stops } = await supabase
      .from('route_stops')
      .select('dispatch_run_id')
      .in('dispatch_run_id', runIds);

    if (stops) {
      for (const s of stops) {
        stopCounts.set(s.dispatch_run_id, (stopCounts.get(s.dispatch_run_id) ?? 0) + 1);
      }
    }
  }

  return (data ?? []).map((r: any) => ({
    id: r.id,
    technicianId: r.technician_id,
    technicianName: r.technicians?.name ?? 'Unknown',
    vanId: r.van_id,
    vanName: r.vans?.name ?? null,
    runDate: r.run_date,
    status: r.status,
    stopCount: stopCounts.get(r.id) ?? 0,
    totalDistanceMeters: r.total_distance_meters,
    totalTravelTimeSeconds: r.total_travel_time_seconds,
  }));
};

/** Fetch all stops for a dispatch run, enriched with work order details. */
export const fetchRouteStops = async (
  dispatchRunId: string
): Promise<RouteStopDetail[]> => {
  const { data, error } = await supabase
    .from('route_stops')
    .select(`
      id,
      sequence_order,
      status,
      work_order_id,
      estimated_arrival,
      estimated_duration_minutes,
      actual_arrival,
      actual_departure,
      distance_to_next_meters,
      travel_time_to_next_seconds,
      work_orders!inner(
        order_number,
        location_address,
        location_lat,
        location_lng,
        customers(name)
      )
    `)
    .eq('dispatch_run_id', dispatchRunId)
    .order('sequence_order', { ascending: true });

  if (error) throw new Error(`Failed to fetch route stops: ${error.message}`);

  return (data ?? []).map((s: any) => ({
    id: s.id,
    sequenceOrder: s.sequence_order,
    status: s.status,
    workOrderId: s.work_order_id,
    workOrderNumber: s.work_orders?.order_number ?? '',
    customerName: s.work_orders?.customers?.name ?? null,
    locationAddress: s.work_orders?.location_address ?? null,
    locationLat: s.work_orders?.location_lat ? Number(s.work_orders.location_lat) : null,
    locationLng: s.work_orders?.location_lng ? Number(s.work_orders.location_lng) : null,
    estimatedArrival: s.estimated_arrival,
    estimatedDurationMinutes: s.estimated_duration_minutes,
    actualArrival: s.actual_arrival,
    actualDeparture: s.actual_departure,
    distanceToNextMeters: s.distance_to_next_meters,
    travelTimeToNextSeconds: s.travel_time_to_next_seconds,
  }));
};

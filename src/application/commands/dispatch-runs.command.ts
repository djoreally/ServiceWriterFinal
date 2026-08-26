/**
 * Dispatch Runs Commands — Phase 3
 *
 * Manages batched route stops for technicians on a given day.
 * Integrates with Mapbox Directions for optimized sequencing.
 */

import { supabase } from '@/integrations/supabase/client';
import { getDrivingRoute, type RoutePoint } from '@/application/queries/mapbox';

// ─── Types ────────────────────────────────────────────────────────────────

export interface CreateDispatchRunPayload {
  userId: string;
  technicianId: string;
  vanId?: string;
  runDate: string; // YYYY-MM-DD
  startLocation?: RoutePoint;
}

export interface AddRouteStopPayload {
  dispatchRunId: string;
  workOrderId: string;
  sequenceOrder: number;
  estimatedDurationMinutes?: number;
}

export interface DispatchRunResult {
  id: string;
  status: string;
}

type WorkOrderLocation = RoutePoint;

// ─── Commands ─────────────────────────────────────────────────────────────

/** Create a new dispatch run for a technician on a given date. */
export const createDispatchRun = async (
  payload: CreateDispatchRunPayload
): Promise<DispatchRunResult> => {
  const { data, error } = await supabase
    .from('dispatch_runs')
    .insert({
      user_id: payload.userId,
      technician_id: payload.technicianId,
      van_id: payload.vanId ?? null,
      run_date: payload.runDate,
      status: 'scheduled',
      start_location_lat: payload.startLocation?.lat ?? null,
      start_location_lng: payload.startLocation?.lng ?? null,
    })
    .select('id, status')
    .single();

  if (error) throw new Error(`Failed to create dispatch run: ${error.message}`);
  return data;
};

/** Add a stop to a dispatch run. */
export const addRouteStop = async (
  payload: AddRouteStopPayload
): Promise<{ id: string }> => {
  const { data, error } = await supabase
    .from('route_stops')
    .insert({
      dispatch_run_id: payload.dispatchRunId,
      work_order_id: payload.workOrderId,
      sequence_order: payload.sequenceOrder,
      estimated_duration_minutes: payload.estimatedDurationMinutes ?? null,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to add route stop: ${error.message}`);
  return data;
};

/** Advance a dispatch run status (scheduled → in_progress → completed). */
export const advanceDispatchRunStatus = async (
  runId: string,
  newStatus: 'in_progress' | 'completed' | 'cancelled'
): Promise<void> => {
  const { error } = await supabase
    .from('dispatch_runs')
    .update({ status: newStatus })
    .eq('id', runId);

  if (error) throw new Error(`Failed to advance run status: ${error.message}`);
};

/** Update a route stop status (pending → en_route → arrived → completed). */
export const advanceRouteStopStatus = async (
  stopId: string,
  newStatus: 'en_route' | 'arrived' | 'completed' | 'skipped'
): Promise<void> => {
  const updates: Record<string, unknown> = { status: newStatus };
  if (newStatus === 'arrived') updates.actual_arrival = new Date().toISOString();
  if (newStatus === 'completed' || newStatus === 'skipped') updates.actual_departure = new Date().toISOString();

  const { error } = await supabase
    .from('route_stops')
    .update(updates as never)
    .eq('id', stopId);

  if (error) throw new Error(`Failed to advance stop status: ${error.message}`);
};

/**
 * Optimize route ordering for a dispatch run using Mapbox Directions.
 * Calculates travel distances/times between sequential stops and updates the run totals.
 *
 * Performance: Makes N-1 Mapbox API calls for N stops. Only call when reordering.
 */
export const optimizeRunRoute = async (
  runId: string
): Promise<{ totalDistanceMeters: number; totalTravelTimeSeconds: number }> => {
  // Fetch the run and its stops with work order locations
  const { data: run, error: runErr } = await supabase
    .from('dispatch_runs')
    .select('id, start_location_lat, start_location_lng')
    .eq('id', runId)
    .single();

  if (runErr || !run) throw new Error('Dispatch run not found');

  const { data: stops, error: stopErr } = await supabase
    .from('route_stops')
    .select('id, sequence_order, work_order_id')
    .eq('dispatch_run_id', runId)
    .order('sequence_order', { ascending: true });

  if (stopErr) throw new Error(`Failed to fetch route stops: ${stopErr.message}`);
  if (!stops || stops.length === 0) return { totalDistanceMeters: 0, totalTravelTimeSeconds: 0 };

  // Fetch work order locations in parallel
  const woIds = stops.map(s => s.work_order_id);
  const { data: workOrders } = await supabase
    .from('work_orders')
    .select('id, location_lat, location_lng')
    .in('id', woIds);

  const woLocationMap = new Map<string, WorkOrderLocation>(
    (workOrders ?? []).map(wo => [
      String(wo.id),
      { lat: Number(wo.location_lat), lng: Number(wo.location_lng) },
    ] as const)
  );

  // Build ordered location array: start → stop1 → stop2 → ...
  const points: RoutePoint[] = [];
  if (run.start_location_lat && run.start_location_lng) {
    points.push({ lat: Number(run.start_location_lat), lng: Number(run.start_location_lng) });
  }
  for (const stop of stops) {
    const loc = woLocationMap.get(String(stop.work_order_id));
    if (loc && !Number.isNaN(loc.lat) && !Number.isNaN(loc.lng)) {
      points.push(loc);
    }
  }

  // Calculate segment distances between consecutive points
  let totalDistance = 0;
  let totalTime = 0;

  for (let i = 0; i < points.length - 1; i++) {
    try {
      const route = await getDrivingRoute({
        origin: points[i],
        destination: points[i + 1],
        profile: 'driving-traffic',
      });

      const stopIdx = run.start_location_lat ? i : i; // stop index offset
      if (stopIdx < stops.length) {
        await supabase
          .from('route_stops')
          .update({
            distance_to_next_meters: i < points.length - 2 ? route.distanceMeters : null,
            travel_time_to_next_seconds: i < points.length - 2 ? route.durationSeconds : null,
          })
          .eq('id', stops[Math.min(stopIdx, stops.length - 1)].id);
      }

      totalDistance += route.distanceMeters;
      totalTime += route.durationSeconds;
    } catch (err) {
      console.warn(`Route segment ${i} failed:`, err);
    }
  }

  // Update run totals
  await supabase
    .from('dispatch_runs')
    .update({
      total_distance_meters: totalDistance,
      total_travel_time_seconds: totalTime,
    })
    .eq('id', runId);

  return { totalDistanceMeters: totalDistance, totalTravelTimeSeconds: totalTime };
};
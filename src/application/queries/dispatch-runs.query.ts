/**
 * Dispatch Runs Queries — Phase 3
 *
 * Read operations for route sequencing and dispatch run data.
 *
 * Phase 2: data access goes through the typed API client
 * (`@/lib/api-client`) to the appointments Hono router. Exported signatures
 * are unchanged.
 */

import { apiClient } from '@/lib/api-client';

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

type RunRow = {
  id: string;
  technician_id: string;
  van_id: string | null;
  run_date: string;
  status: string;
  total_distance_meters: number | null;
  total_travel_time_seconds: number | null;
  stop_count: number;
  technicians: { name: string } | null;
  vans: { name: string } | null;
};

type StopRow = {
  id: string;
  sequence_order: number;
  status: string;
  work_order_id: string;
  estimated_arrival: string | null;
  estimated_duration_minutes: number | null;
  actual_arrival: string | null;
  actual_departure: string | null;
  distance_to_next_meters: number | null;
  travel_time_to_next_seconds: number | null;
  work_orders: {
    order_number: string;
    location_address: string | null;
    location_lat: number | string | null;
    location_lng: number | string | null;
    customers: { name: string } | null;
  } | null;
};

/** Fetch all dispatch runs for a user on a given date. */
export const fetchDispatchRuns = async (
  userId: string,
  date: string
): Promise<DispatchRunSummary[]> => {
  const response = await apiClient.get<{ data: RunRow[] }>("/v1/dispatch-runs", {
    query: { user_id: userId, date },
  });
  const data = response.data ?? [];

  return data.map((r: any) => ({
    id: r.id,
    technicianId: r.technician_id,
    technicianName: r.technicians?.name ?? 'Unknown',
    vanId: r.van_id,
    vanName: r.vans?.name ?? null,
    runDate: r.run_date,
    status: r.status,
    stopCount: r.stop_count ?? 0,
    totalDistanceMeters: r.total_distance_meters,
    totalTravelTimeSeconds: r.total_travel_time_seconds,
  }));
};

/** Fetch all stops for a dispatch run, enriched with work order details. */
export const fetchRouteStops = async (
  dispatchRunId: string
): Promise<RouteStopDetail[]> => {
  const response = await apiClient.get<{ data: StopRow[] }>(
    `/v1/dispatch-runs/${encodeURIComponent(dispatchRunId)}/stops`
  );
  const data = response.data ?? [];

  return data.map((s: any) => ({
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

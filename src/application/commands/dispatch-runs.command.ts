/**
 * Dispatch Runs Commands — Phase 3
 *
 * Manages batched route stops for technicians on a given day.
 *
 * Phase 2: all data access goes through the typed API client
 * (`@/lib/api-client`) to the appointments Hono router. Route optimization
 * runs server-side. Exported signatures are unchanged. The server resolves
 * the workspace from the auth token.
 */

import { apiClient } from "@/lib/api-client";

// ─── Types ────────────────────────────────────────────────────────────────

export interface CreateDispatchRunPayload {
  userId: string;
  technicianId: string;
  vanId?: string;
  runDate: string; // YYYY-MM-DD
  startLocation?: { lat: number; lng: number };
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

// ─── Commands ─────────────────────────────────────────────────────────────

/** Create a new dispatch run for a technician on a given date. */
export const createDispatchRun = async (
  payload: CreateDispatchRunPayload
): Promise<DispatchRunResult> => {
  const response = await apiClient.post<{ data: DispatchRunResult }>("/v1/dispatch-runs", {
    user_id: payload.userId,
    technician_id: payload.technicianId,
    van_id: payload.vanId ?? null,
    run_date: payload.runDate,
    start_location: payload.startLocation ?? null,
  });
  return response.data;
};

/** Add a stop to a dispatch run. */
export const addRouteStop = async (
  payload: AddRouteStopPayload
): Promise<{ id: string }> => {
  const response = await apiClient.post<{ data: { id: string } }>(
    `/v1/dispatch-runs/${encodeURIComponent(payload.dispatchRunId)}/stops`,
    {
      work_order_id: payload.workOrderId,
      sequence_order: payload.sequenceOrder,
      estimated_duration_minutes: payload.estimatedDurationMinutes ?? null,
    }
  );
  return response.data;
};

/** Advance a dispatch run status (scheduled → in_progress → completed). */
export const advanceDispatchRunStatus = async (
  runId: string,
  newStatus: 'in_progress' | 'completed' | 'cancelled'
): Promise<void> => {
  await apiClient.patch(`/v1/dispatch-runs/${encodeURIComponent(runId)}`, {
    status: newStatus,
  });
};

/** Update a route stop status (pending → en_route → arrived → completed). */
export const advanceRouteStopStatus = async (
  stopId: string,
  newStatus: 'en_route' | 'arrived' | 'completed' | 'skipped'
): Promise<void> => {
  const updates: Record<string, unknown> = { status: newStatus };
  if (newStatus === 'arrived') updates.actual_arrival = new Date().toISOString();
  if (newStatus === 'completed' || newStatus === 'skipped') updates.actual_departure = new Date().toISOString();

  await apiClient.patch(`/v1/dispatch-runs/route-stops/${encodeURIComponent(stopId)}`, updates);
};

/**
 * Optimize route ordering for a dispatch run using server-side routing.
 * Calculates travel distances/times between sequential stops and updates the run totals.
 */
export const optimizeRunRoute = async (
  runId: string
): Promise<{ totalDistanceMeters: number; totalTravelTimeSeconds: number }> => {
  const response = await apiClient.post<{
    data: { totalDistanceMeters: number; totalTravelTimeSeconds: number };
  }>(`/v1/dispatch-runs/${encodeURIComponent(runId)}/optimize`, {});
  return response.data;
};

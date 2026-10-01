/**
 * Booking Context Commands — Write operations for geo-scheduling booking contexts.
 *
 * Phase 2: all data access goes through the typed API client
 * (`@/lib/api-client`) to the appointments Hono router. Exported signatures
 * are unchanged; results keep the `{ data, error }` shape.
 */
import { apiClient } from "@/lib/api-client";
import type { Json } from "@/integrations/supabase/types";
import type {
  LocationSchedulingContext,
  VehicleSchedulingContext,
  ServiceSelectionContext,
} from "@/lib/geo-slot-generation";

interface DataErrorResult<T> { data: T | null; error: unknown }

function toJson(
  value: LocationSchedulingContext | VehicleSchedulingContext | ServiceSelectionContext,
): Json {
  return value as unknown as Json;
}

/** Create a new booking context. */
export async function createBookingContext(
  businessUserId: string,
  locationContext: LocationSchedulingContext,
  sessionId?: string,
): Promise<DataErrorResult<{ id: string }>> {
  const response = await apiClient.post<DataErrorResult<{ id: string }>>("/v1/appointments/booking-contexts", {
    business_user_id: businessUserId,
    location_context: toJson(locationContext),
    session_id: sessionId ?? null,
  });
  return { data: response.data ?? null, error: response.error ?? null };
}

/** Update vehicle context on an existing booking context (Step 2). */
export async function updateVehicleContext(
  contextId: string,
  vehicleContext: VehicleSchedulingContext,
): Promise<DataErrorResult<{ id: string }>> {
  const response = await apiClient.patch<DataErrorResult<{ id: string }>>(
    `/v1/appointments/booking-contexts/${encodeURIComponent(contextId)}`,
    { vehicle_context: toJson(vehicleContext) },
  );
  return { data: response.data ?? null, error: response.error ?? null };
}

/** Update service context on an existing booking context (Step 3). */
export async function updateServiceContext(
  contextId: string,
  serviceContext: ServiceSelectionContext,
): Promise<DataErrorResult<{ id: string }>> {
  const response = await apiClient.patch<DataErrorResult<{ id: string }>>(
    `/v1/appointments/booking-contexts/${encodeURIComponent(contextId)}`,
    { service_context: toJson(serviceContext) },
  );
  return { data: response.data ?? null, error: response.error ?? null };
}

/** Reserve a slot (mark booking context as reserved). */
export async function reserveSlot(
  contextId: string,
  date: string,
  time: string,
): Promise<DataErrorResult<{ id: string }>> {
  const response = await apiClient.patch<DataErrorResult<{ id: string }>>(
    `/v1/appointments/booking-contexts/${encodeURIComponent(contextId)}`,
    { selected_date: date, selected_time: time, status: "reserved" },
  );
  return { data: response.data ?? null, error: response.error ?? null };
}

/** Complete a booking context after appointment is created. */
export async function completeBookingContext(
  contextId: string,
  jobContext?: Record<string, Json>,
): Promise<DataErrorResult<{ id: string }>> {
  const response = await apiClient.patch<DataErrorResult<{ id: string }>>(
    `/v1/appointments/booking-contexts/${encodeURIComponent(contextId)}`,
    { status: "completed", ...(jobContext ? { job_context: jobContext as unknown as Record<string, unknown> } : {}) },
  );
  return { data: response.data ?? null, error: response.error ?? null };
}

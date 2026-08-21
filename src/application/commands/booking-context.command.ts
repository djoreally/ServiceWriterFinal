/**
 * Booking Context Commands — Write operations for geo-scheduling booking contexts.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type {
  LocationSchedulingContext,
  VehicleSchedulingContext,
  ServiceSelectionContext,
} from "@/lib/geo-slot-generation";

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
) {
  return supabase
    .from("booking_contexts")
    .insert([
      {
        business_user_id: businessUserId,
        session_id: sessionId ?? null,
        location_context: toJson(locationContext),
        status: "active",
      },
    ])
    .select("id")
    .single();
}

/** Update vehicle context on an existing booking context (Step 2). */
export async function updateVehicleContext(
  contextId: string,
  vehicleContext: VehicleSchedulingContext,
) {
  return supabase
    .from("booking_contexts")
    .update({
      vehicle_context: toJson(vehicleContext),
      updated_at: new Date().toISOString(),
    })
    .eq("id", contextId);
}

/** Update service context on an existing booking context (Step 3). */
export async function updateServiceContext(
  contextId: string,
  serviceContext: ServiceSelectionContext,
) {
  return supabase
    .from("booking_contexts")
    .update({
      service_context: toJson(serviceContext),
      updated_at: new Date().toISOString(),
    })
    .eq("id", contextId);
}

/** Reserve a slot (mark booking context as reserved). */
export async function reserveSlot(
  contextId: string,
  date: string,
  time: string,
) {
  return supabase
    .from("booking_contexts")
    .update({
      selected_date: date,
      selected_time: time,
      status: "reserved",
      updated_at: new Date().toISOString(),
    })
    .eq("id", contextId);
}

/** Complete a booking context after appointment is created. */
export async function completeBookingContext(contextId: string, jobContext?: Record<string, Json>) {
  let vehicleContext: Json | undefined;
  if (jobContext) {
    const { data } = await supabase
      .from("booking_contexts")
      .select("vehicle_context")
      .eq("id", contextId)
      .maybeSingle();
    const current = data?.vehicle_context;
    vehicleContext = {
      ...(current && typeof current === "object" && !Array.isArray(current) ? current : {}),
      ...jobContext,
    } as Json;
  }
  return supabase
    .from("booking_contexts")
    .update({
      status: "completed",
      ...(vehicleContext !== undefined ? { vehicle_context: vehicleContext } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", contextId);
}

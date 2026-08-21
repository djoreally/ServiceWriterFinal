/**
 * Booking Context Query — Read operations for geo-scheduling booking contexts.
 */
import { supabase } from "@/integrations/supabase/client";
import type {
  LocationSchedulingContext,
  VehicleSchedulingContext,
  ServiceSelectionContext,
} from "@/lib/geo-slot-generation";

export interface BookingContextRecord {
  id: string;
  business_user_id: string;
  session_id: string | null;
  location_context: LocationSchedulingContext | null;
  vehicle_context: VehicleSchedulingContext | null;
  service_context: ServiceSelectionContext | null;
  selected_date: string | null;
  selected_time: string | null;
  status: string;
  expires_at: string;
  created_at: string;
}

/** Fetch route-safe availability via edge function. */
export async function fetchRouteSafeSlots(
  bookingContextId: string,
  businessUserId: string,
  date: string
): Promise<{ data: any; error: any }> {
  return supabase.functions.invoke("route-safe-availability", {
    body: { bookingContextId, businessUserId, date },
  });
}

/** Verify location via edge function (Step 1). */
export async function verifyLocation(
  customerAddress: string,
  businessUserId: string,
  sessionId?: string
): Promise<{ data: any; error: any }> {
  return supabase.functions.invoke("verify-location", {
    body: { customerAddress, businessUserId, sessionId },
  });
}

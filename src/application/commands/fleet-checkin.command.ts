/**
 * Fleet Check-In Command - Write operations for check-in actions.
 */

import { supabase } from "@/integrations/supabase/client";

export interface CheckInParams {
  userId: string;
  workOrderId: string;
  checkinType: "arrival" | "departure" | "photo";
  lat: number | null;
  lng: number | null;
  accuracyMeters: number | null;
  notes: string | null;
}

/**
 * Record a check-in and update work order status accordingly.
 */
export async function recordCheckIn(params: CheckInParams): Promise<void> {
  const { error } = await supabase.from("fleet_checkins").insert({
    user_id: params.userId,
    fleet_work_order_id: params.workOrderId,
    checkin_type: params.checkinType,
    lat: params.lat,
    lng: params.lng,
    accuracy_meters: params.accuracyMeters,
    notes: params.notes,
  });

  if (error) throw new Error("Failed to record check-in");

  // Update work order status for arrival/departure
  if (params.checkinType === "arrival") {
    await supabase.from("fleet_work_orders").update({ status: "in_progress" }).eq("id", params.workOrderId);
  } else if (params.checkinType === "departure") {
    await supabase.from("fleet_work_orders").update({ status: "completed" }).eq("id", params.workOrderId);
  }
}

/**
 * Fleet Check-In Command - Write operations for check-in actions.
 */

import { apiClient } from "@/lib/api-client";

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
  await apiClient.post("/v1/fleet/checkins", { params });
}

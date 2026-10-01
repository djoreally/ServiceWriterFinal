/**
 * Booking Vehicle Query - Vehicle photo lookup for booking flow.
 *
 * Phase 2: the edge-function call goes through the sanctioned domain proxy
 * (`POST /v1/appointments/edge/:function`) instead of the browser Supabase
 * client. Exported signatures are unchanged.
 */

import { apiClient } from "@/lib/api-client";

/** Fetch vehicle photo by VIN via edge function. Returns image URL or null. */
export async function fetchVehiclePhoto(vin: string): Promise<string | null> {
  try {
    const response = await apiClient.post<{ data: { data?: { retail?: string[] } } | null; error: unknown }>(
      "/v1/appointments/edge/vehicle-photos",
      { body: { vin } },
    );

    if (!response.error && (response.data?.data?.retail?.length ?? 0) > 0) {
      return response.data!.data!.retail![0];
    }
    return null;
  } catch {
    return null;
  }
}

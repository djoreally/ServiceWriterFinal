/**
 * Geocode backfill for appointment service locations.
 *
 * The service-area map needs coordinates. Appointments store a free-form
 * `location_address`, so this command geocodes the rows that still lack
 * coordinates and writes them back, one small batch at a time.
 *
 * Phase 2: the batch geocode runs server-side in the appointments Hono
 * router (`POST /v1/appointments/geocode-backfill`); this module only
 * forwards the requested batch size.
 */
import { apiClient } from "@/lib/api-client";

export interface GeocodeBackfillResult {
  scanned: number;
  geocoded: number;
  failed: number;
  remaining: number;
}

export async function backfillAppointmentCoordinates(batchSize = 25): Promise<GeocodeBackfillResult> {
  return apiClient.post<GeocodeBackfillResult>("/v1/appointments/geocode-backfill", {
    batch_size: batchSize,
  });
}

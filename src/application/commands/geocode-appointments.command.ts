/**
 * Geocode backfill for appointment service locations.
 *
 * The service-area map needs coordinates. Appointments store a free-form
 * `location_address`, so this command geocodes the rows that still lack
 * coordinates and writes them back, one small batch at a time.
 */
import { supabase } from "@/integrations/supabase/client";
import { geocodeAddress } from "@/application/queries/mapbox";

export interface GeocodeBackfillResult {
  scanned: number;
  geocoded: number;
  failed: number;
  remaining: number;
}

export async function backfillAppointmentCoordinates(batchSize = 25): Promise<GeocodeBackfillResult> {
  const { data, error, count } = await supabase
    .from("appointments")
    .select("id, location_address", { count: "exact" })
    .is("location_lat", null)
    .not("location_address", "is", null)
    .is("deleted_at", null)
    .limit(batchSize);
  if (error) throw error;

  const rows = data ?? [];
  let geocoded = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const result = await geocodeAddress(String(row.location_address), { limit: 1 });
      if (!result) {
        failed += 1;
        continue;
      }
      const { error: updateError } = await supabase
        .from("appointments")
        .update({ location_lat: result.lat, location_lng: result.lng })
        .eq("id", row.id);
      if (updateError) throw updateError;
      geocoded += 1;
    } catch {
      failed += 1;
    }
  }

  return {
    scanned: rows.length,
    geocoded,
    failed,
    remaining: Math.max(0, (count ?? rows.length) - geocoded),
  };
}

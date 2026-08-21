/**
 * Booking Vehicle Query - Vehicle photo lookup for booking flow.
 */

import { supabase } from "@/integrations/supabase/client";

/** Fetch vehicle photo by VIN via edge function. Returns image URL or null. */
export async function fetchVehiclePhoto(vin: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke("vehicle-photos", {
      body: { vin },
    });

    if (!error && data?.data?.retail?.length > 0) {
      return data.data.retail[0];
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Vehicle Detail Commands — Write operations for vehicle records.
 */
import { supabase } from "@/integrations/supabase/client";

/** Update vehicle notes */
export async function updateVehicleNotes(vehicleId: string, notes: string) {
  return supabase.from("vehicles").update({ notes }).eq("id", vehicleId);
}

/** Update vehicle details (incl. admin-override specs: engine/oil_type/oil_capacity) */
export async function updateVehicleDetails(
  vehicleId: string,
  data: {
    make: string;
    model: string;
    year: number;
    vin: string | null;
    license_plate: string | null;
    color: string | null;
    mileage: number | null;
    notes: string | null;
    engine?: string | null;
    oil_type?: string | null;
    oil_capacity?: string | null;
  }
) {
  return supabase.from("vehicles").update(data).eq("id", vehicleId);
}

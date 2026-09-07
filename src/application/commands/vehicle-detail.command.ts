/** Vehicle Detail Commands — canonical workspace-scoped vehicle writes. */
import { nextApi } from "@/lib/nextApiClient";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

async function updateVehicle(vehicleId: string, data: Record<string, unknown>) {
  try {
    const context = await resolveCurrentWorkspace();
    if (!context) throw new Error("No active workspace is available.");
    const response = await nextApi.vehicles.update(vehicleId, {
      workspace_id: context.workspaceId,
      ...data,
    });
    return { data: response.data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

/** Update vehicle notes through the authenticated workspace API. */
export async function updateVehicleNotes(vehicleId: string, notes: string) {
  return updateVehicle(vehicleId, { notes });
}

/** Update vehicle details and canonical vehicle-service specs through one API boundary. */
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
  return updateVehicle(vehicleId, data);
}

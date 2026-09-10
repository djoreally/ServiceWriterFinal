/**
 * Vehicles Command - canonical workspace-scoped vehicle writes.
 *
 * All active vehicle mutations go through the authenticated Next API boundary.
 */

import { ApiClientError, nextApi } from "@/lib/nextApiClient";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";
import { invalidateVehicleOverview } from "@/application/queries/vehicles.query";
import { invalidateCustomerOverview } from "@/application/queries/customers.query";

export interface VehicleWritePayload {
  customer_id: string | null;
  make: string;
  model: string;
  year: number;
  vin: string | null;
  license_plate: string | null;
  plate_state: string | null;
  color: string | null;
  mileage: number | null;
  odometer_measure: string | null;
  notes: string | null;
  oil_type: string | null;
  oil_capacity: string | null;
}

function requireSelectedWorkspaceId(): string {
  const workspaceId = getSelectedWorkspaceId();
  if (!workspaceId) throw new Error("Select a workspace before managing vehicles.");
  return workspaceId;
}

function vehiclePayload(workspace_id: string, payload: VehicleWritePayload): Record<string, unknown> {
  return { workspace_id, ...payload };
}

function invalidateVehicleRelatedCaches(workspaceId: string): void {
  invalidateVehicleOverview(workspaceId);
  invalidateCustomerOverview(workspaceId);
}

export async function createVehicle(payload: VehicleWritePayload): Promise<void> {
  const workspaceId = requireSelectedWorkspaceId();
  await nextApi.vehicles.create(vehiclePayload(workspaceId, payload));
  invalidateVehicleRelatedCaches(workspaceId);
}

export async function updateVehicle(id: string, payload: VehicleWritePayload): Promise<void> {
  const workspaceId = requireSelectedWorkspaceId();
  await nextApi.vehicles.update(id, vehiclePayload(workspaceId, payload));
  invalidateVehicleRelatedCaches(workspaceId);
}

export async function updateVehicleOilType(id: string, oilType: string): Promise<void> {
  const workspaceId = requireSelectedWorkspaceId();
  try {
    await nextApi.vehicles.update(id, { workspace_id: workspaceId, oil_type: oilType });
    invalidateVehicleOverview(workspaceId);
  } catch (error) {
    // Appointment completion records the selected oil type in the canonical
    // service record as well. A stale/legacy vehicle projection must not block
    // closing the appointment simply because that optional profile write can no
    // longer resolve the vehicle in the selected workspace.
    if (error instanceof ApiClientError && error.status === 404) {
      console.warn("[updateVehicleOilType] vehicle profile unavailable; preserving oil type in service record", {
        vehicleId: id,
        workspaceId,
      });
      return;
    }
    throw error;
  }
}

export async function deleteVehicle(id: string): Promise<void> {
  const workspaceId = requireSelectedWorkspaceId();
  await nextApi.vehicles.remove(workspaceId, id);
  invalidateVehicleRelatedCaches(workspaceId);
}

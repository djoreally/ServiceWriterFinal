/**
 * Vehicles Command - Write operations for vehicles.
 *
 * Uses direct Supabase calls instead of the API server.
 * Sprint 1 Epic 1.1 - Updated to use soft delete for GDPR compliance
 */

import { supabase } from "@/integrations/supabase/client";
import { hardDelete } from "@/lib/soft-delete";
import { nextApi } from "@/lib/nextApiClient";
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
  await nextApi.vehicles.update(id, { workspace_id: workspaceId, oil_type: oilType });
  invalidateVehicleOverview(workspaceId);
}

export async function deleteVehicle(id: string): Promise<void> {
  const workspaceId = requireSelectedWorkspaceId();
  await nextApi.vehicles.remove(workspaceId, id);
  invalidateVehicleRelatedCaches(workspaceId);
}

/**
 * Permanently delete a vehicle (admin only)
 * ⚠️ WARNING: This permanently removes vehicle data
 */
export async function hardDeleteVehicle(id: string): Promise<void> {
  const workspaceId = requireSelectedWorkspaceId();
  const { error } = await hardDelete(supabase, "vehicles", id);
  if (error) throw error;
  invalidateVehicleRelatedCaches(workspaceId);
}

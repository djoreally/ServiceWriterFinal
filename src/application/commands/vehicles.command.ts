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

export async function createVehicle(payload: VehicleWritePayload): Promise<void> {
  await nextApi.vehicles.create(vehiclePayload(requireSelectedWorkspaceId(), payload));
}

export async function updateVehicle(id: string, payload: VehicleWritePayload): Promise<void> {
  await nextApi.vehicles.update(id, vehiclePayload(requireSelectedWorkspaceId(), payload));
}

export async function updateVehicleOilType(id: string, oilType: string): Promise<void> {
  await nextApi.vehicles.update(id, { workspace_id: requireSelectedWorkspaceId(), oil_type: oilType });
}

export async function deleteVehicle(id: string): Promise<void> {
  await nextApi.vehicles.remove(requireSelectedWorkspaceId(), id);
}

/**
 * Permanently delete a vehicle (admin only)
 * ⚠️ WARNING: This permanently removes vehicle data
 */
export async function hardDeleteVehicle(id: string): Promise<void> {
  const { error } = await hardDelete(supabase, "vehicles", id);
  if (error) throw error;
}

/**
 * Vehicles Command - Write operations for vehicles.
 *
 * Uses direct Supabase calls instead of the API server.
 * Sprint 1 Epic 1.1 - Updated to use soft delete for GDPR compliance
 */

import { supabase } from "@/integrations/supabase/client";
import { softDelete, hardDelete } from "@/lib/soft-delete";
import { requireWorkspaceOwnerUserId } from "@/application/tenant-workspace";

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

export async function createVehicle(payload: VehicleWritePayload): Promise<void> {
  const ownerUserId = await requireWorkspaceOwnerUserId();

  const { error } = await supabase
    .from("vehicles")
    .insert([{ ...payload, user_id: ownerUserId }]);

  if (error) throw new Error(error.message);
}

export async function updateVehicle(id: string, payload: VehicleWritePayload): Promise<void> {
  const { error } = await supabase
    .from("vehicles")
    .update(payload)
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function updateVehicleOilType(id: string, oilType: string): Promise<void> {
  const { error } = await supabase
    .from("vehicles")
    .update({ oil_type: oilType })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteVehicle(id: string): Promise<void> {
  const { error } = await softDelete(supabase, "vehicles", id);
  if (error) throw error;
}

/**
 * Permanently delete a vehicle (admin only)
 * ⚠️ WARNING: This permanently removes vehicle data
 */
export async function hardDeleteVehicle(id: string): Promise<void> {
  const { error } = await hardDelete(supabase, "vehicles", id);
  if (error) throw error;
}

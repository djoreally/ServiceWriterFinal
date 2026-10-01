/**
 * Vehicle Parts Registry Command — write operations for per-vehicle part numbers
 * and for applying/consuming parts on fleet work orders.
 */
import { apiClient, ApiClientError } from "@/lib/api-client";
import type { VehicleKind } from "@/application/queries/vehicle-parts-registry.query";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface VehiclePartInput {
  part_category: string;
  part_number: string;
  brand?: string | null;
  oem_number?: string | null;
  quantity?: number;
  unit?: string | null;
  inventory_item_id?: string | null;
  is_required?: boolean;
  notes?: string | null;
}

async function requireUser(): Promise<string> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export async function addVehiclePart(
  kind: VehicleKind,
  vehicleId: string,
  input: VehiclePartInput,
): Promise<void> {
  await requireUser();
  try {
    await apiClient.post("/v1/vehicle-part-assignments", {
      kind,
      vehicle_id: vehicleId,
      input,
    });
  } catch (error) {
    if (error instanceof ApiClientError && error.code === "duplicate_part") {
      throw new Error("That part number is already assigned to this vehicle");
    }
    throw new Error(error instanceof Error ? error.message : "Failed to add part");
  }
}

export async function updateVehiclePart(id: string, input: VehiclePartInput): Promise<void> {
  await requireUser();
  try {
    await apiClient.patch(`/v1/vehicle-part-assignments/${id}`, { input });
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Failed to update part");
  }
}

export async function deleteVehiclePart(id: string): Promise<void> {
  try {
    await apiClient.delete(`/v1/vehicle-part-assignments/${id}`);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Failed to delete part");
  }
}

/**
 * Promote confirmed part numbers into the shared vehicle_specifications reference so the
 * workspace builds its own fitment coverage over time.
 */
export async function promotePartsToSpecReference(params: {
  year: number | null;
  make: string | null;
  model: string | null;
  engine: string | null;
  parts: Array<{ part_category: string; part_number: string }>;
}): Promise<void> {
  const { year, make, model } = params;
  if (!year || !make || !model) return;
  await apiClient.post("/v1/vehicle-specs/promote-parts", params);
}

// ---------- Fleet work order parts ----------

export interface WorkOrderPartLineInput {
  description: string;
  part_number?: string | null;
  quantity: number;
  unit_price: number;
  inventory_item_id?: string | null;
  van_id?: string | null;
  fleet_vehicle_id?: string | null;
  unit?: string | null;
}

/** Transactional: rewrite the work order's part lines and reserve matching stock. */
export async function applyWorkOrderParts(
  workOrderId: string,
  lines: WorkOrderPartLineInput[],
): Promise<{ lines: number; reservations: number }> {
  try {
    const { data } = await apiClient.post<{ data: { lines: number; reservations: number } }>(
      `/v1/work-orders/${workOrderId}/parts/apply`,
      { lines },
    );
    return {
      lines: typeof data?.lines === "number" ? data.lines : 0,
      reservations: typeof data?.reservations === "number" ? data.reservations : 0,
    };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Failed to apply parts");
  }
}

/** Consume reserved parts: decrements van stock (or warehouse when no van assigned). */
export async function consumeWorkOrderParts(workOrderId: string): Promise<{ consumed: number }> {
  try {
    const { data } = await apiClient.post<{ data: { consumed: number } }>(
      `/v1/work-orders/${workOrderId}/parts/consume`,
    );
    return { consumed: typeof data?.consumed === "number" ? data.consumed : 0 };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Failed to consume parts");
  }
}

/**
 * Vehicle Parts Registry Command — write operations for per-vehicle part numbers
 * and for applying/consuming parts on fleet work orders.
 */
import { supabase } from "@/integrations/supabase/client";
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

/** Resolve the workspace owner that owns the vehicle row, so team members write valid rows. */
async function resolveVehicleOwner(kind: VehicleKind, vehicleId: string): Promise<string> {
  const table = kind === "fleet" ? "fleet_vehicles" : "vehicles";
  const { data, error } = await (supabase as any)
    .from(table)
    .select("user_id")
    .eq("id", vehicleId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.user_id) throw new Error("Vehicle not found");
  return data.user_id as string;
}

export async function addVehiclePart(
  kind: VehicleKind,
  vehicleId: string,
  input: VehiclePartInput,
): Promise<void> {
  const actorId = await requireUser();
  const ownerId = await resolveVehicleOwner(kind, vehicleId);

  const row = {
    user_id: ownerId,
    vehicle_kind: kind,
    fleet_vehicle_id: kind === "fleet" ? vehicleId : null,
    vehicle_id: kind === "retail" ? vehicleId : null,
    part_category: input.part_category,
    part_number: input.part_number.trim(),
    brand: input.brand?.trim() || null,
    oem_number: input.oem_number?.trim() || null,
    quantity: input.quantity ?? 1,
    unit: input.unit || null,
    inventory_item_id: input.inventory_item_id || null,
    is_required: input.is_required ?? true,
    notes: input.notes?.trim() || null,
    verified_by: actorId,
    verified_at: new Date().toISOString(),
  };

  const { error } = await (supabase as any).from("vehicle_part_assignments").insert(row);
  if (error) {
    if (error.code === "23505") throw new Error("That part number is already assigned to this vehicle");
    throw new Error(error.message);
  }
}

export async function updateVehiclePart(id: string, input: VehiclePartInput): Promise<void> {
  const actorId = await requireUser();
  const { error } = await (supabase as any)
    .from("vehicle_part_assignments")
    .update({
      part_category: input.part_category,
      part_number: input.part_number.trim(),
      brand: input.brand?.trim() || null,
      oem_number: input.oem_number?.trim() || null,
      quantity: input.quantity ?? 1,
      unit: input.unit || null,
      inventory_item_id: input.inventory_item_id || null,
      is_required: input.is_required ?? true,
      notes: input.notes?.trim() || null,
      verified_by: actorId,
      verified_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteVehiclePart(id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("vehicle_part_assignments")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
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
  const { year, make, model, engine, parts } = params;
  if (!year || !make || !model) return;

  const map: Record<string, string> = {
    oil_filter: "oil_filter",
    air_filter: "air_filter",
    cabin_filter: "cabin_filter",
    fuel_filter: "fuel_filter",
    wiper_blade_driver: "wiper_blade_driver",
    wiper_blade_passenger: "wiper_blade_passenger",
    wiper_blade_rear: "wiper_blade_rear",
  };

  const payload: Record<string, unknown> = {};
  for (const p of parts) {
    const col = map[p.part_category];
    if (col && p.part_number) payload[col] = p.part_number;
  }
  if (Object.keys(payload).length === 0) return;

  const { data: existing } = await (supabase as any)
    .from("vehicle_specifications")
    .select("id")
    .eq("year", year)
    .ilike("make", make)
    .ilike("model", model)
    .maybeSingle();

  if (existing?.id) {
    await (supabase as any).from("vehicle_specifications").update(payload).eq("id", existing.id);
  } else {
    await (supabase as any)
      .from("vehicle_specifications")
      .insert({ year, make, model, engine: engine || null, source: "shop_confirmed", ...payload });
  }
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
  const { data, error } = await (supabase as any).rpc("apply_work_order_parts_v1", {
    p_work_order_id: workOrderId,
    p_lines: lines,
  });
  if (error) throw new Error(error.message);
  return (data ?? { lines: 0, reservations: 0 }) as { lines: number; reservations: number };
}

/** Consume reserved parts: decrements van stock (or warehouse when no van assigned). */
export async function consumeWorkOrderParts(workOrderId: string): Promise<{ consumed: number }> {
  const { data, error } = await (supabase as any).rpc("consume_work_order_parts_v1", {
    p_work_order_id: workOrderId,
  });
  if (error) throw new Error(error.message);
  return (data ?? { consumed: 0 }) as { consumed: number };
}

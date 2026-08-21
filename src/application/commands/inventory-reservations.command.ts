/**
 * Inventory Reservation Commands — Reserve, consume, and release parts.
 *
 * Lifecycle: reserved → consumed | released | expired
 */

import { supabase } from "@/integrations/supabase/client";

// ============= Types =============

export interface ReserveInventoryPayload {
  inventoryItemId: string;
  quantity: number;
  workOrderId?: string | null;
  appointmentId?: string | null;
  vanId?: string | null;
  /** Hours until reservation auto-expires (default: 48) */
  expiresInHours?: number;
  notes?: string | null;
}

export interface ReservationResult {
  reservationId: string;
  availableAfter: number;
}

// ============= Commands =============

/**
 * Reserve inventory for a work order or appointment.
 * Checks current available quantity before reserving.
 */
export async function reserveInventory(
  userId: string,
  payload: ReserveInventoryPayload
): Promise<ReservationResult> {
  // 1. Check available stock (total quantity minus active reservations)
  const [itemResult, reservedResult] = await Promise.all([
    supabase
      .from("inventory_items")
      .select("quantity")
      .eq("id", payload.inventoryItemId)
      .single(),
    supabase
      .from("inventory_reservations")
      .select("quantity")
      .eq("inventory_item_id", payload.inventoryItemId)
      .eq("status", "reserved"),
  ]);

  if (itemResult.error) throw new Error(`Item not found: ${itemResult.error.message}`);

  const totalStock = itemResult.data.quantity ?? 0;
  const totalReserved = (reservedResult.data ?? []).reduce(
    (sum, r) => sum + (r.quantity ?? 0),
    0
  );
  const available = totalStock - totalReserved;

  if (available < payload.quantity) {
    throw new Error(
      `Insufficient stock: ${available} available, ${payload.quantity} requested`
    );
  }

  // 2. Create reservation
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + (payload.expiresInHours ?? 48));

  const { data, error } = await supabase
    .from("inventory_reservations")
    .insert({
      user_id: userId,
      inventory_item_id: payload.inventoryItemId,
      work_order_id: payload.workOrderId ?? null,
      appointment_id: payload.appointmentId ?? null,
      van_id: payload.vanId ?? null,
      quantity: payload.quantity,
      expires_at: expiresAt.toISOString(),
      notes: payload.notes ?? null,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to reserve: ${error.message}`);

  return {
    reservationId: data.id,
    availableAfter: available - payload.quantity,
  };
}

/** Consume a reservation (parts used during work order execution). Decrements actual inventory. */
export async function consumeReservation(reservationId: string) {
  // Get reservation details
  const { data: reservation, error: fetchErr } = await supabase
    .from("inventory_reservations")
    .select("inventory_item_id, quantity, status")
    .eq("id", reservationId)
    .single();

  if (fetchErr || !reservation) throw new Error("Reservation not found");
  if (reservation.status !== "reserved") throw new Error("Reservation is not active");

  const now = new Date().toISOString();

  // Decrement stock first and surface the error: the old parallel call with a
  // manual fallback could mark the reservation consumed while stock stayed put.
  const decrementRes = await supabase.rpc("decrement_inventory_quantity", {
    p_item_id: reservation.inventory_item_id,
    p_quantity: reservation.quantity,
  });
  if (decrementRes.error) {
    throw new Error(`Failed to decrement stock: ${decrementRes.error.message}`);
  }

  const updateRes = await supabase
    .from("inventory_reservations")
    .update({ status: "consumed", consumed_at: now, updated_at: now })
    .eq("id", reservationId);

  if (updateRes.error) throw new Error(`Failed to consume: ${updateRes.error.message}`);
}


/** Release a reservation (cancellation, no longer needed). */
export async function releaseReservation(reservationId: string) {
  const { error } = await supabase
    .from("inventory_reservations")
    .update({
      status: "released",
      released_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", reservationId)
    .eq("status", "reserved");

  if (error) throw new Error(`Failed to release: ${error.message}`);
}

/** Release all reservations for a work order (e.g., on cancellation). */
export async function releaseWorkOrderReservations(workOrderId: string) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("inventory_reservations")
    .update({ status: "released", released_at: now, updated_at: now })
    .eq("work_order_id", workOrderId)
    .eq("status", "reserved");

  if (error) throw new Error(`Failed to release WO reservations: ${error.message}`);
}

/** Fetch active reservations for a work order. */
export async function fetchWorkOrderReservations(workOrderId: string) {
  return supabase
    .from("inventory_reservations")
    .select("*, inventory_items(name, sku, unit_cost)")
    .eq("work_order_id", workOrderId)
    .eq("status", "reserved")
    .order("created_at", { ascending: true });
}

/** Fetch shortage alerts: items with more reserved than available. */
export async function fetchInventoryShortages(userId: string) {
  // Get all items with active reservations
  const { data: items } = await supabase
    .from("inventory_items")
    .select("id, name, sku, quantity, low_stock_threshold")
    .eq("user_id", userId);

  if (!items?.length) return [];

  const { data: reservations } = await supabase
    .from("inventory_reservations")
    .select("inventory_item_id, quantity")
    .eq("user_id", userId)
    .eq("status", "reserved");

  // Aggregate reserved quantities per item
  const reservedMap = new Map<string, number>();
  for (const r of reservations ?? []) {
    const current = reservedMap.get(r.inventory_item_id) ?? 0;
    reservedMap.set(r.inventory_item_id, current + (r.quantity ?? 0));
  }

  // Return items where available < threshold
  return items
    .map((item) => {
      const reserved = reservedMap.get(item.id) ?? 0;
      const available = (item.quantity ?? 0) - reserved;
      return { ...item, reserved, available };
    })
    .filter(
      (item) => item.available <= (item.low_stock_threshold ?? 0)
    );
}

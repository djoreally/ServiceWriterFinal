/**
 * Inventory Reservation Commands — Reserve, consume, and release parts.
 *
 * Lifecycle: reserved → consumed | released | expired
 *
 * All reads/writes go through the typed API client to the work-orders Hono
 * router. Exported signatures are unchanged.
 */

import { apiClient } from "@/lib/api-client";

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
  const response = await apiClient.post<{ data: { reservation_id: string; available_after: number } }>(
    "/v1/inventory/reservations/reserve",
    {
      user_id: userId,
      inventory_item_id: payload.inventoryItemId,
      work_order_id: payload.workOrderId ?? null,
      appointment_id: payload.appointmentId ?? null,
      van_id: payload.vanId ?? null,
      quantity: payload.quantity,
      expires_in_hours: payload.expiresInHours ?? 48,
      notes: payload.notes ?? null,
    },
  );
  return {
    reservationId: response.data.reservation_id,
    availableAfter: response.data.available_after,
  };
}

/** Consume a reservation (parts used during work order execution). Decrements actual inventory. */
export async function consumeReservation(reservationId: string) {
  await apiClient.post(`/v1/inventory/reservations/${encodeURIComponent(reservationId)}/consume`, {});
}

/** Release a reservation (cancellation, no longer needed). */
export async function releaseReservation(reservationId: string) {
  await apiClient.post(`/v1/inventory/reservations/${encodeURIComponent(reservationId)}/release`, {});
}

/** Release all reservations for a work order (e.g., on cancellation). */
export async function releaseWorkOrderReservations(workOrderId: string) {
  await apiClient.post("/v1/inventory/reservations/release-by-work-order", {
    work_order_id: workOrderId,
  });
}

/** Fetch active reservations for a work order. */
export async function fetchWorkOrderReservations(workOrderId: string) {
  try {
    const response = await apiClient.get<{ data: unknown[] }>("/v1/inventory/reservations", {
      query: { work_order_id: workOrderId },
    });
    return { data: response.data ?? [], error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error("Failed to load reservations") };
  }
}

/** Fetch shortage alerts: items with more reserved than available. */
export async function fetchInventoryShortages(userId: string) {
  const response = await apiClient.get<{
    data: {
      items: Array<{ id: string; name: string; sku: string | null; quantity: number | null; low_stock_threshold: number | null } & Record<string, unknown>>;
      reservations: Array<{ inventory_item_id: string; quantity: number | null }>;
    };
  }>("/v1/inventory/shortages", { query: { user_id: userId } });

  const { items, reservations } = response.data;

  if (!items?.length) return [];

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

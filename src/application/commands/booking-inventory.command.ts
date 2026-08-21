/**
 * Booking ↔ Inventory bridge commands.
 *
 * Reserves oil stock when an appointment is booked, consumes it on
 * completion (with optional manual override), and releases on cancel.
 *
 * Resolution rules:
 *   1. Match an inventory item by oil_type (e.g. "5W-30").
 *   2. Convert vehicle.oil_capacity (parsed to qts) into the item's stocking unit.
 *   3. Reserve van-first (if appointment.assigned_van_id), fallback to warehouse.
 */

import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";

type InventoryItemRow = Pick<Database["public"]["Tables"]["inventory_items"]["Row"], "id" | "name" | "sku" | "unit">;
type ServiceCatalogPartRow = Pick<Database["public"]["Tables"]["service_catalog_parts"]["Row"], "inventory_item_id" | "quantity" | "use_vehicle_oil_capacity" | "unit" | "is_required">;
type ReservationSource = "van" | "warehouse";
type ReserveOilRpcRow = Database["public"]["Functions"]["reserve_oil_for_appointment"]["Returns"][number];
type ReservePartsRpcRow = Database["public"]["Functions"]["reserve_parts_for_appointment"]["Returns"][number];
type ConsumeReservationRpcRow = Database["public"]["Functions"]["consume_appointment_reservations"]["Returns"][number];

export interface ReserveOilForBookingInput {
  appointmentId: string;
  businessUserId: string;
  vehicleId: string | null;
  vanId?: string | null;
  oilTypeOverride?: string | null;
  oilCapacityOverrideQt?: number | null;
}

export interface ReserveOilResult {
  reservationId: string | null;
  itemId: string | null;
  itemName: string | null;
  source: "van" | "warehouse" | null;
  quantity: number;
  unit: string | null;
  shortage: number;
  skipped: boolean;
  reason?: string;
}

/**
 * Find the best-matching inventory item for a given oil_type string.
 * Match priority: exact name match → name contains type → SKU contains type.
 */
async function findOilItem(
  businessUserId: string,
  oilType: string,
): Promise<{ id: string; name: string; unit: string } | null> {
  const normalized = oilType.trim().toUpperCase().replace(/\s+/g, "");
  if (!normalized) return null;

  const { data: items } = await supabase
    .from("inventory_items")
    .select("id, name, sku, unit, category")
    .eq("user_id", businessUserId)
    .or("category.ilike.%oil%,name.ilike.%W-%,name.ilike.%w-%");

  if (!items?.length) return null;

  const norm = (s: string | null) => (s || "").toUpperCase().replace(/\s+/g, "");

  // Exact name match first
  const inventoryItems = items as InventoryItemRow[];

  const exact = inventoryItems.find((i) => norm(i.name) === normalized);
  if (exact) return { id: exact.id, name: exact.name, unit: exact.unit || "qt" };

  // Name contains
  const partial = inventoryItems.find((i) => norm(i.name).includes(normalized));
  if (partial) return { id: partial.id, name: partial.name, unit: partial.unit || "qt" };

  // SKU contains
  const bySku = inventoryItems.find((i) => norm(i.sku).includes(normalized));
  if (bySku) return { id: bySku.id, name: bySku.name, unit: bySku.unit || "qt" };

  return null;
}

/**
 * Reserve oil for a booking using vehicle oil specs (with optional override).
 * Returns an info object — never throws — so booking flow is resilient.
 */
export async function reserveOilForBooking(
  input: ReserveOilForBookingInput,
): Promise<ReserveOilResult> {
  const skipped = (reason: string): ReserveOilResult => ({
    reservationId: null,
    itemId: null,
    itemName: null,
    source: null,
    quantity: 0,
    unit: null,
    shortage: 0,
    skipped: true,
    reason,
  });

  try {
    let oilType = input.oilTypeOverride?.trim() || null;
    let capacityQt = input.oilCapacityOverrideQt ?? null;

    if ((!oilType || !capacityQt) && input.vehicleId) {
      const { data: vehicle } = await supabase
        .from("vehicles")
        .select("oil_type, oil_capacity")
        .eq("id", input.vehicleId)
        .maybeSingle();

      if (vehicle) {
        if (!oilType) oilType = vehicle.oil_type?.trim() || null;
        if (!capacityQt && vehicle.oil_capacity) {
          const { data: parsed } = await supabase.rpc("parse_oil_capacity_qt", {
            p_text: vehicle.oil_capacity,
          });
          capacityQt = Number(parsed) || null;
        }
      }
    }

    if (!oilType) return skipped("no_oil_type");
    if (!capacityQt || capacityQt <= 0) return skipped("no_oil_capacity");

    const item = await findOilItem(input.businessUserId, oilType);
    if (!item) return skipped(`no_matching_item:${oilType}`);

    const { data, error } = await supabase.rpc(
      "reserve_oil_for_appointment",
      {
        p_appointment_id: input.appointmentId,
        p_inventory_item_id: item.id,
        p_quantity_qt: capacityQt,
        p_van_id: input.vanId ?? null,
      },
    );

    if (error) {
      console.warn("[reserveOilForBooking] RPC error", error);
      return skipped(`rpc_error:${error.message}`);
    }

    const row = (Array.isArray(data) ? data[0] : data) as ReserveOilRpcRow | null;
    if (!row) return skipped("no_reservation_returned");

    return {
      reservationId: row.reservation_id,
      itemId: item.id,
      itemName: item.name,
      source: row.source as ReservationSource,
      quantity: Number(row.reserved_quantity ?? 0),
      unit: item.unit,
      shortage: Number(row.shortage ?? 0),
      skipped: false,
    };
  } catch (err) {
    console.warn("[reserveOilForBooking] failed", err);
    return skipped("exception");
  }
}

// ===========================================================================
// Multi-item reservation: oil + filters + additives
// ===========================================================================

export interface ReserveServicePartsInput {
  appointmentId: string;
  businessUserId: string;
  vehicleId: string | null;
  vanId?: string | null;
  /** Catalog IDs of the services booked. Their linked parts will be reserved. */
  serviceCatalogIds: string[];
}

export interface ReservedPartLine {
  inventoryItemId: string;
  itemName: string;
  reservationId: string | null;
  source: "van" | "warehouse" | null;
  quantity: number;
  unit: string | null;
  shortage: number;
}

export interface ReserveServicePartsResult {
  reservations: ReservedPartLine[];
  skipped: { itemId?: string; itemName?: string; reason: string }[];
}

/**
 * Reserve every inventory part required by the booked services
 * (oil, filters, additives, etc.) using the catalog → parts mapping.
 *
 * Quantities can be fixed OR derived from the vehicle's oil_capacity.
 * Resilient: failures are captured per-item and never throw.
 */
export async function reserveServicePartsForBooking(
  input: ReserveServicePartsInput,
): Promise<ReserveServicePartsResult> {
  const out: ReserveServicePartsResult = { reservations: [], skipped: [] };

  try {
    if (!input.serviceCatalogIds.length) {
      out.skipped.push({ reason: "no_services" });
      return out;
    }

    // 1. Resolve vehicle oil capacity once (in qts) for use_vehicle_oil_capacity rows
    let vehicleCapacityQt: number | null = null;
    if (input.vehicleId) {
      const { data: vehicle } = await supabase
        .from("vehicles")
        .select("oil_capacity")
        .eq("id", input.vehicleId)
        .maybeSingle();

      if (vehicle?.oil_capacity) {
        const { data: parsed } = await supabase.rpc(
          "parse_oil_capacity_qt",
          { p_text: vehicle.oil_capacity },
        );
        vehicleCapacityQt = Number(parsed) || null;
      }
    }

    // 2. Fetch all parts linked to these services
    const { data: parts, error: partsErr } = await supabase
      .from("service_catalog_parts")
      .select("inventory_item_id, quantity, use_vehicle_oil_capacity, unit, is_required")
      .in("service_catalog_id", input.serviceCatalogIds);

    if (partsErr) {
      out.skipped.push({ reason: `parts_query_error:${partsErr.message}` });
      return out;
    }
    if (!parts?.length) {
      out.skipped.push({ reason: "no_parts_configured" });
      return out;
    }

    // 3. Aggregate by inventory item (sum quantities if multiple services share an item)
    const itemNamesById = new Map<string, string>();
    const aggregated = new Map<string, number>();

    for (const p of (parts ?? []) as ServiceCatalogPartRow[]) {
      let qt = Number(p.quantity ?? 0);
      if (p.use_vehicle_oil_capacity) {
        if (!vehicleCapacityQt) {
          out.skipped.push({ itemId: p.inventory_item_id, reason: "no_vehicle_oil_capacity" });
          continue;
        }
        qt = vehicleCapacityQt;
      }
      if (!qt || qt <= 0) {
        out.skipped.push({ itemId: p.inventory_item_id, reason: "zero_quantity" });
        continue;
      }
      aggregated.set(
        p.inventory_item_id,
        (aggregated.get(p.inventory_item_id) ?? 0) + qt,
      );
    }

    if (aggregated.size === 0) return out;

    // 4. Look up names for nicer logging/UI
    const itemIds = Array.from(aggregated.keys());
    const { data: items } = await supabase
      .from("inventory_items")
      .select("id, name")
      .in("id", itemIds);
    for (const i of items ?? []) itemNamesById.set(i.id, i.name);

    // 5. Reserve all in one RPC call
    const payload = Array.from(aggregated.entries()).map(([id, qty]) => ({
      inventory_item_id: id,
      quantity_qt: qty,
    }));

    const { data, error } = await supabase.rpc(
      "reserve_parts_for_appointment",
      {
        p_appointment_id: input.appointmentId,
        p_van_id: input.vanId ?? null,
        p_items: payload as Json,
      },
    );

    if (error) {
      out.skipped.push({ reason: `rpc_error:${error.message}` });
      return out;
    }

    for (const row of (data ?? []) as ReservePartsRpcRow[]) {
      out.reservations.push({
        inventoryItemId: row.inventory_item_id,
        itemName: itemNamesById.get(row.inventory_item_id) ?? "Unknown item",
        reservationId: row.reservation_id,
        source: row.source as ReservationSource,
        quantity: Number(row.reserved_quantity ?? 0),
        unit: row.unit ?? null,
        shortage: Number(row.shortage ?? 0),
      });
    }

    return out;
  } catch (err) {
    console.warn("[reserveServicePartsForBooking] failed", err);
    out.skipped.push({ reason: "exception" });
    return out;
  }
}

/**
 * Consume all reserved inventory for an appointment on completion.
 * `overrideQtyQt` lets the technician record actual oil used (in quarts).
 */
export async function consumeAppointmentReservations(
  appointmentId: string,
  overrideQtyQt?: number | null,
) {
  const { data, error } = await supabase.rpc(
    "consume_appointment_reservations",
    {
      p_appointment_id: appointmentId,
      p_override_qty_qt: overrideQtyQt ?? null,
    },
  );
  if (error) {
    console.warn("[consumeAppointmentReservations] error", error);
    return { ok: false, consumed: [] as ConsumeReservationRpcRow[], error: error.message };
  }
  return { ok: true, consumed: (data ?? []) as ConsumeReservationRpcRow[] };
}

/**
 * Release reservations for a cancelled appointment.
 */
export async function releaseAppointmentReservations(appointmentId: string) {
  const { data, error } = await supabase.rpc(
    "release_appointment_reservations",
    { p_appointment_id: appointmentId },
  );
  if (error) {
    console.warn("[releaseAppointmentReservations] error", error);
    return { ok: false, released: 0, error: error.message };
  }
  return { ok: true, released: Number(data ?? 0) };
}

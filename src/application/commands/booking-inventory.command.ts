/**
 * Booking ↔ Inventory bridge commands.
 *
 * Reserves oil stock when an appointment is booked, consumes it on
 * completion (with optional manual override), and releases on cancel.
 *
 * Phase 2: the bridge logic runs server-side through the typed API client
 * (`@/lib/api-client`) to the appointments Hono router. Exported signatures
 * are unchanged, and the functions stay resilient (they return skip reasons
 * instead of throwing).
 */

import { apiClient } from "@/lib/api-client";

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
 * Reserve oil for a booking using vehicle oil specs (with optional override).
 * Returns an info object — never throws — so booking flow is resilient.
 */
export async function reserveOilForBooking(
  input: ReserveOilForBookingInput,
): Promise<ReserveOilResult> {
  try {
    const response = await apiClient.post<{ data: ReserveOilResult }>(
      "/v1/appointments/booking-inventory/reserve-oil",
      {
        appointment_id: input.appointmentId,
        business_user_id: input.businessUserId,
        vehicle_id: input.vehicleId,
        van_id: input.vanId ?? null,
        oil_type_override: input.oilTypeOverride ?? null,
        oil_capacity_override_qt: input.oilCapacityOverrideQt ?? null,
      },
    );
    return response.data;
  } catch (err) {
    console.warn("[reserveOilForBooking] failed", err);
    return {
      reservationId: null, itemId: null, itemName: null, source: null,
      quantity: 0, unit: null, shortage: 0, skipped: true, reason: "exception",
    };
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
    const response = await apiClient.post<{ data: ReserveServicePartsResult }>(
      "/v1/appointments/booking-inventory/reserve-parts",
      {
        appointment_id: input.appointmentId,
        business_user_id: input.businessUserId,
        vehicle_id: input.vehicleId,
        van_id: input.vanId ?? null,
        service_catalog_ids: input.serviceCatalogIds,
      },
    );
    return response.data ?? out;
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
  const response = await apiClient.post<{
    data: { ok: boolean; consumed: Array<Record<string, unknown>>; error?: string };
  }>("/v1/appointments/booking-inventory/consume", {
    appointment_id: appointmentId,
    override_qty_qt: overrideQtyQt ?? null,
  });
  const result = response.data;
  if (!result.ok) console.warn("[consumeAppointmentReservations] error", result.error);
  return result;
}

/**
 * Release reservations for a cancelled appointment.
 */
export async function releaseAppointmentReservations(appointmentId: string) {
  const response = await apiClient.post<{
    data: { ok: boolean; released: number; error?: string };
  }>("/v1/appointments/booking-inventory/release", {
    appointment_id: appointmentId,
  });
  const result = response.data;
  if (!result.ok) console.warn("[releaseAppointmentReservations] error", result.error);
  return result;
}

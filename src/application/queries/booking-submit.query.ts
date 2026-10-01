/**
 * Booking Submit Queries — Read operations for the booking submission flow.
 */
import { apiClient } from "@/lib/api-client";

/**
 * Compatibility boundary for the former owner-user-scoped fallback.
 * Public customer identity is authoritative only when returned by the
 * slug-scoped public_booking_upsert_customer RPC. If that RPC fails we must
 * not bypass tenant resolution with a direct customers-table lookup.
 */
export async function findCustomerByEmail(_legacyUserId: string, _email: string) {
  return {
    data: null as { id: string } | null,
    error: new Error("Public customer lookup requires canonical booking context."),
  };
}

/** Fetch van technician assignment data after van auto-assignment. */
export async function fetchVanForAssignment(vanId: string) {
  return apiClient.get<{
    data: { assigned_technician_id: string | null } | null;
    error: unknown;
  }>("/v1/platform/booking/van-assignment", { query: { van_id: vanId } });
}

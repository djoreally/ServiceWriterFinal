/**
 * Public Booking Commands — Write operations for the public booking flow.
 * Extracted from public-booking.query.ts to enforce command/query separation.
 */
import { apiClient } from "@/lib/api-client";

/** Track abandoned booking. */
export async function trackAbandonedBooking(data: Record<string, unknown>) {
  return apiClient.post<{ id: string }>("/v1/platform/booking/track-abandoned", data);
}

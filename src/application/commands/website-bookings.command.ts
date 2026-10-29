/**
 * Website Bookings Commands — application-layer wrappers for the staff
 * Website Bookings queue (selective push of MOMS-website bookings into
 * Service Writer). All calls go through apiClient to the Hono routes in
 * src/server/hono/routes/website-bookings.ts.
 */
import { apiClient } from "@/lib/api-client";
import type {
  PushDecision,
  PushPreview,
  PushResult,
  WebsiteBooking,
  WebsiteBookingListStatus,
} from "@/lib/website-bookings";

export async function fetchWebsiteBookingsQueue(
  workspaceId: string,
  status: WebsiteBookingListStatus,
): Promise<WebsiteBooking[]> {
  const response = await apiClient.get<{ data: WebsiteBooking[] }>("/v1/website-bookings/queue", {
    query: { workspace_id: workspaceId, status },
  });
  return response.data ?? [];
}

export async function prepareWebsiteBookingPushes(
  workspaceId: string,
  bookingIds: string[],
): Promise<{ previews: PushPreview[]; not_found: string[] }> {
  const response = await apiClient.post<{ data: { previews: PushPreview[]; not_found: string[] } }>(
    "/v1/website-bookings/prepare",
    { workspace_id: workspaceId, booking_ids: bookingIds },
    { timeout: 120_000 },
  );
  return response.data;
}

export async function pushWebsiteBookings(
  workspaceId: string,
  decisions: PushDecision[],
): Promise<PushResult[]> {
  const response = await apiClient.post<{ data: PushResult[] }>(
    "/v1/website-bookings/push",
    { workspace_id: workspaceId, decisions },
    { timeout: 180_000 },
  );
  return response.data ?? [];
}

export async function setWebsiteBookingNeverPush(
  workspaceId: string,
  bookingId: string,
  neverPush: boolean,
): Promise<void> {
  await apiClient.post("/v1/website-bookings/never-push", {
    workspace_id: workspaceId,
    booking_id: bookingId,
    never_push: neverPush,
  });
}

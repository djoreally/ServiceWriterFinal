/**
 * Google Calendar Query — Read operations for Google Calendar sync.
 */
import { apiClient } from "@/lib/api-client";

/** Get Google Calendar connection status */
export interface GoogleCalendarStatusData {
  connected: boolean | null;
  sync_enabled: boolean | null;
  needs_reauth: boolean | null;
  last_sync_at: string | null;
  last_sync_error: string | null;
  calendar_id: string | null;
  connected_at: string | null;
}

export async function getGoogleCalendarStatus() {
  const data = await apiClient.get<GoogleCalendarStatusData | null>("/v1/platform/google-calendar/status");
  return { data, error: null };
}

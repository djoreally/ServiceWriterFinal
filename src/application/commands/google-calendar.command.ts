/**
 * Google Calendar Commands — Write operations for Google Calendar sync.
 */
import { supabase } from "@/integrations/supabase/client";

/** App route Google redirects back to after calendar authorization. */
export const GOOGLE_CALENDAR_REDIRECT_PATH = "/google-calendar/callback";

/** Start the standalone Google Calendar OAuth flow; returns the consent URL. */
export async function startGoogleCalendarOAuth(redirectUri: string): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  return supabase.functions.invoke("google-calendar-sync", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: { mode: "oauth_start", redirect_uri: redirectUri },
  });
}

/** Complete the standalone Google Calendar OAuth flow with the returned code. */
export async function completeGoogleCalendarOAuth(code: string, redirectUri: string): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  return supabase.functions.invoke("google-calendar-sync", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: { mode: "oauth_callback", code, redirect_uri: redirectUri },
  });
}

/** Exchange OAuth provider tokens after Google sign-in */
export async function exchangeGoogleTokens(
  providerToken: string,
  providerRefreshToken: string | null
): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  return supabase.functions.invoke("google-calendar-sync", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: {
      mode: "exchange_token",
      provider_token: providerToken,
      provider_refresh_token: providerRefreshToken,
    },
  });
}

/** Push an appointment to Google Calendar */
export async function syncAppointmentToGoogle(
  appointment: Record<string, unknown>
): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  return supabase.functions.invoke("google-calendar-sync", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: { mode: "sync_appointment", appointment },
  });
}

/** Disconnect Google Calendar */
export async function disconnectGoogleCalendar(): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  return supabase.functions.invoke("google-calendar-sync", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: { mode: "disconnect" },
  });
}

/** Re-push all upcoming unsynced appointments to the connected Google Calendar. */
export async function runGoogleCalendarBackfill(): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  return supabase.functions.invoke("google-calendar-sync", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: { mode: "backfill" },
  });
}

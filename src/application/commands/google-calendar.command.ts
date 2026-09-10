/**
 * Google Calendar Commands — Write operations for Google Calendar sync.
 */
import { supabase } from "@/integrations/supabase/client";

/** App route Google redirects back to after calendar authorization. */
export const GOOGLE_CALENDAR_REDIRECT_PATH = "/google-calendar/callback";

async function invokeGoogleCalendar(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const { data, error } = await supabase.functions.invoke("google-calendar-sync", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body,
  });

  if (error) {
    const context = (error as { context?: { text?: () => Promise<string> } }).context;
    if (context?.text) {
      const raw = await context.text().catch(() => "");
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { error?: string };
          if (parsed.error) throw new Error(parsed.error);
        } catch (caught) {
          if (caught instanceof Error && !(caught instanceof SyntaxError)) throw caught;
        }
      }
    }
    throw new Error(error.message || "Google Calendar integration request failed");
  }
  if (data?.error) throw new Error(String(data.error));
  return { data, error: null };
}

/** Start the standalone Google Calendar OAuth flow; returns the consent URL. */
export async function startGoogleCalendarOAuth(redirectUri: string) {
  return invokeGoogleCalendar({ mode: "oauth_start", redirect_uri: redirectUri });
}

/** Complete the standalone Google Calendar OAuth flow with the returned code. */
export async function completeGoogleCalendarOAuth(code: string, state: string, redirectUri: string) {
  return invokeGoogleCalendar({ mode: "oauth_callback", code, state, redirect_uri: redirectUri });
}

/** Exchange OAuth provider tokens after Google sign-in. */
export async function exchangeGoogleTokens(providerToken: string, providerRefreshToken: string | null) {
  return invokeGoogleCalendar({
    mode: "exchange_token",
    provider_token: providerToken,
    provider_refresh_token: providerRefreshToken,
  });
}

/** Push an appointment to Google Calendar. */
export async function syncAppointmentToGoogle(appointment: Record<string, unknown>) {
  return invokeGoogleCalendar({ mode: "sync_appointment", appointment });
}

/** Disconnect Google Calendar. */
export async function disconnectGoogleCalendar() {
  return invokeGoogleCalendar({ mode: "disconnect" });
}

/** Re-push all upcoming unsynced appointments to the connected Google Calendar. */
export async function runGoogleCalendarBackfill() {
  return invokeGoogleCalendar({ mode: "backfill" });
}

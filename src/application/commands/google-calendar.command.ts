/**
 * Google Calendar Commands — Write operations for Google Calendar sync.
 */
import { apiClient } from "@/lib/api-client";
import { supabase } from "@/integrations/supabase/client";

/** App route Google redirects back to after calendar authorization. */
export const GOOGLE_CALENDAR_REDIRECT_PATH = "/google-calendar/callback";

async function invokeGoogleCalendar(body: Record<string, unknown>) {
  const { data } = await apiClient.post<{
    data: {
      error?: string;
      backfill?: { pushed: number; failed: number; repaired: number };
    } | null;
  }>(
    "/v1/platform/google-calendar/invoke",
    { body },
  );
  return { data, error: null };
}

/**
 * Start Calendar authorization using the Google provider already configured in
 * Supabase Auth. This deliberately avoids a second, drifting Google OAuth
 * client configuration inside Edge Functions.
 */
export interface GoogleCalendarOAuthResult {
  connected?: boolean;
  authorization_url?: string;
  url?: string;
  error?: string;
  backfill?: { pushed: number; failed: number; repaired: number };
}

export async function startGoogleCalendarOAuth(redirectUri: string): Promise<{ data: GoogleCalendarOAuthResult; error: null }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  // If the current Google session already carries a provider token, use it
  // immediately and avoid another consent round-trip.
  if (session.provider_token) {
    const result = await exchangeGoogleTokens(
      session.provider_token,
      session.provider_refresh_token ?? null,
    );
    return { data: { ...(result.data ?? {}), connected: true }, error: null };
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectUri,
      skipBrowserRedirect: true,
      scopes: "https://www.googleapis.com/auth/calendar.events",
      queryParams: {
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
      },
    },
  });

  if (error) throw new Error(error.message || "Unable to start Google authorization");
  if (!data.url) throw new Error("Google did not return an authorization URL");
  return { data: { authorization_url: data.url }, error: null };
}

/** Legacy direct callback kept for older in-flight authorization URLs. */
export async function completeGoogleCalendarOAuth(code: string, state: string, redirectUri: string) {
  return invokeGoogleCalendar({ mode: "oauth_callback", code, state, redirect_uri: redirectUri });
}

/** Exchange OAuth provider tokens after Google sign-in/consent. */
export async function exchangeGoogleTokens(providerToken: string, providerRefreshToken: string | null) {
  return invokeGoogleCalendar({
    mode: "exchange_token",
    provider_token: providerToken,
    provider_refresh_token: providerRefreshToken,
  });
}

/** Push an appointment to Google Calendar. */
export async function syncAppointmentToGoogle(appointment: Record<string, unknown>) {
  const appointmentId = typeof appointment.id === "string" ? appointment.id : "";
  if (!appointmentId) throw new Error("Appointment id is required for Google Calendar sync");
  return invokeGoogleCalendar({ mode: "sync_appointment", appointment_id: appointmentId });
}

/** Disconnect Google Calendar. */
export async function disconnectGoogleCalendar() {
  return invokeGoogleCalendar({ mode: "disconnect" });
}

/** Re-push all upcoming unsynced appointments to the connected Google Calendar. */
export async function runGoogleCalendarBackfill() {
  return invokeGoogleCalendar({ mode: "backfill" });
}

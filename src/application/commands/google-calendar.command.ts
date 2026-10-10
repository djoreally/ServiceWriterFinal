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
 *
 * The Google identity is LINKED to the current session (linkIdentity) instead
 * of starting a fresh sign-in, so the OAuth grant always lands on the current
 * user. A fresh sign-in (signInWithOAuth) can silently replace the session
 * when the Google account's email differs from the login email — tokens then
 * land under a user with no workspace membership and the UI stays
 * "Not connected" with no explanation. If linking is unavailable (e.g. manual
 * linking is disabled in the Supabase dashboard), we fall back to the sign-in
 * flow and the OAuth callback detects the mismatch and shows an honest error.
 */
export interface GoogleCalendarOAuthResult {
  connected?: boolean;
  authorization_url?: string;
  url?: string;
  error?: string;
  backfill?: { pushed: number; failed: number; repaired: number };
}

/**
 * Session-storage key recording which user started the Google OAuth flow, so
 * the callback page can detect a session switch (Google signed in as a
 * different login than the current user).
 */
export const GOOGLE_OAUTH_INITIATOR_KEY = "google_oauth_user_id";

function rememberOAuthInitiator(userId: string) {
  try {
    sessionStorage.setItem(GOOGLE_OAUTH_INITIATOR_KEY, userId);
  } catch {
    // Non-browser context — the callback check is skipped.
  }
}

export async function startGoogleCalendarOAuth(redirectUri: string): Promise<{ data: GoogleCalendarOAuthResult; error: null }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  const userId = session.user.id;

  // If the current Google session already carries a provider token, use it
  // immediately and avoid another consent round-trip.
  if (session.provider_token) {
    const result = await exchangeGoogleTokens(
      session.provider_token,
      session.provider_refresh_token ?? null,
    );
    return { data: { ...(result.data ?? {}), connected: true }, error: null };
  }

  rememberOAuthInitiator(userId);

  const oauthOptions = {
    redirectTo: redirectUri,
    skipBrowserRedirect: true,
    scopes: "https://www.googleapis.com/auth/calendar.events",
    queryParams: {
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
    },
  };

  // Preferred: link the Google identity to the CURRENT session. The grant
  // lands on the current user no matter which Google account is chosen.
  const { data: linkData, error: linkError } = await supabase.auth.linkIdentity({
    provider: "google",
    options: oauthOptions,
  });
  if (!linkError && linkData?.url) {
    return { data: { authorization_url: linkData.url }, error: null };
  }
  console.warn(
    "[GoogleCalendar] linkIdentity unavailable, falling back to sign-in flow:",
    linkError?.message ?? "no authorization URL returned",
  );

  // Fallback: sign-in based connect. The OAuth callback compares the
  // post-round-trip user against GOOGLE_OAUTH_INITIATOR_KEY and shows an
  // honest mismatch error instead of silently staying "Not connected".
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: oauthOptions,
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

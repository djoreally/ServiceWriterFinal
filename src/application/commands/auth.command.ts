/**
 * Auth commands - sign in, sign up, sign out
 */
import { AUTH_SUPABASE_PROJECT_ID_RESOLVED, authSupabase, supabase } from "@/integrations/supabase/client";
import { isTransientBackendError } from "@/lib/transient-backend";
import { withOperationTimeout } from "@/lib/operation-timeout";

type SignInError = { message?: string; status?: number; code?: string };
type PasswordSignInResponse = { error: SignInError | null };

/**
 * A transport-level failure (gateway timeout, upstream 5xx, offline) is NOT a
 * credential problem. Surfacing it as "invalid credentials" sent users chasing
 * password resets while the auth service was simply timing out.
 */
export function isTransientAuthFailure(error: SignInError): boolean {
  return isTransientBackendError(error);
}


export type MagicLinkResult =
  | { sent: true }
  | { sent: false; error: string };

/**
 * A rejected *application* API key (revoked/invalid publishable key, wrong
 * project) is a configuration outage, not a bad password. Masking it as
 * "invalid credentials" previously made a platform outage look like a user
 * error and sent people chasing password resets.
 */
export function isBackendConfigurationFailure(error: SignInError): boolean {
  const message = (error.message || "").toLowerCase();
  return (
    message.includes("invalid api key") ||
    message.includes("no api key") ||
    message.includes("invalid authentication credentials") ||
    error.code === "invalid_api_key"
  );
}

export function getSafeSignInError(error: SignInError): string {
  const message = (error.message || "").toLowerCase();
  if (error.status === 429 || message.includes("rate limit")) {
    return "Too many sign-in attempts. Wait a few minutes, then try again.";
  }
  if (isBackendConfigurationFailure(error)) {
    return "This app build cannot reach its backend (the application API key was rejected). This is a configuration problem, not your password — please report it.";
  }
  if (isTransientAuthFailure(error)) {
    return "The authentication service is temporarily unavailable. Please try again in a moment.";
  }
  if (error.code === "email_provider_disabled") {
    return "Email sign-in is disabled for this app environment. Use Continue with Google, or enable Email sign-in for the same environment you are testing.";
  }
  // Keep invalid credentials, unknown accounts, and confirmation state
  // indistinguishable so the login form cannot be used to enumerate users.
  return "Unable to sign in with those credentials.";
}

export async function signUpWithEmail(email: string, password: string): Promise<{ error?: string }> {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const { error } = await authSupabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/dashboard` },
  });
  return error ? { error: error.message } : {};
}

const SIGN_IN_MAX_ATTEMPTS = 2;
const SIGN_IN_RETRY_DELAY_MS = 600;
// The auth service can legitimately take 20s+ while it is under load; aborting
// earlier turned slow-but-valid logins into "bad credentials". Must stay below
// the transport-level backstop abort in the Supabase client (20s → 40s there).
const SIGN_IN_REQUEST_TIMEOUT_MS = 25_000;
// Total wall-clock ceiling for the whole submit, retries included, so the form
// is never disabled for an unbounded time.
const SIGN_IN_TOTAL_BUDGET_MS = 40_000;

export async function signInWithPassword(email: string, password: string): Promise<{ error?: string }> {
  // Keep the interactive flow bounded. A user can retry after a transient
  // transport failure, but the page must never keep retrying in the background
  // while its only submit control remains disabled.
  const startedAt = Date.now();
  let error: SignInError | null = null;
  for (let attempt = 1; attempt <= SIGN_IN_MAX_ATTEMPTS; attempt++) {
    const remaining = SIGN_IN_TOTAL_BUDGET_MS - (Date.now() - startedAt);
    if (attempt > 1 && remaining < 5_000) break;
    try {
      const signInOperation = authSupabase.auth.signInWithPassword({ email, password }) as Promise<PasswordSignInResponse>;
      const result = await withOperationTimeout<PasswordSignInResponse>(
        signInOperation,
        Math.min(SIGN_IN_REQUEST_TIMEOUT_MS, Math.max(remaining, 5_000)),
        "The sign-in request timed out before the authentication service responded.",
      );
      error = result.error;
    } catch (requestError) {
      error = {
        message: requestError instanceof Error ? requestError.message : "The sign-in request timed out.",
        code: "request_timeout",
      };
    }

    if (!error || !isTransientAuthFailure(error)) break;
    if (attempt < SIGN_IN_MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, SIGN_IN_RETRY_DELAY_MS));
    }
  }


  // Do not disclose whether an email address exists or why authentication failed.
  if (error) {
    console.warn("[auth] Password sign-in failed", {
      projectRef: AUTH_SUPABASE_PROJECT_ID_RESOLVED || "unknown",
      code: error.code ?? "unknown",
      status: error.status ?? null,
      transient: isTransientAuthFailure(error),
    });

    return { error: getSafeSignInError(error) };
  }
  void supabase.rpc("record_auth_security_event_v1", { p_event_type: "login_success" });
  return {};
}

export async function requestMagicLink(email: string): Promise<MagicLinkResult> {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const { error } = await authSupabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/dashboard`,
      // A sign-in form must never create a new business-owner account.
      shouldCreateUser: false,
    },
  });

  if (!error) return { sent: true };

  console.warn("[auth] Magic-link request failed", {
    code: error.code ?? "unknown",
    status: error.status ?? null,
    name: error.name,
  });

  if (error.status === 429 || error.code === "over_email_send_rate_limit") {
    return { sent: false, error: "Too many magic-link requests. Wait a few minutes, then try again." };
  }
  if (error.code === "email_provider_disabled") {
    return {
      sent: false,
      error: "Magic links are disabled for this app environment. Use Continue with Google, or enable Email sign-in for the same environment you are testing.",
    };
  }
  if (isTransientAuthFailure(error)) {
    return { sent: false, error: "The authentication service is temporarily unavailable. Please try again in a moment." };
  }

  // Avoid revealing whether an account exists or is eligible for passwordless
  // login. Supabase also returns a success-shaped response for unknown users.
  return { sent: true };
}

export async function requestPasswordReset(email: string): Promise<void> {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  // Supabase applies its server-side recovery rate limits. Callers intentionally
  // receive the same UI response whether or not the email is registered.
  await authSupabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/reset-password` });
}

export async function updatePassword(password: string): Promise<{ error?: string }> {
  const { error } = await authSupabase.auth.updateUser({ password });
  if (error) return { error: "This reset link is invalid or has expired. Request a new one." };
  void supabase.rpc("record_auth_security_event_v1", { p_event_type: "password_reset_completed" });
  return {};
}

export async function fetchOwnerDisplayName(): Promise<string | null> {
  try {
    const { data: profile } = await supabase
      .from("business_profiles")
      .select("owner_name, business_name")
      .maybeSingle();
    return profile?.owner_name || profile?.business_name || null;
  } catch {
    return null;
  }
}

/** Initiate Google OAuth (published domain path) with calendar scope. */
export async function signInWithGoogleOAuth(
  redirectTo: string,
  queryParams: Record<string, string>
) {
  return authSupabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true, queryParams },
  });
}

/** Refresh the current Supabase auth session (e.g. to prevent idle expiry). */
export async function refreshAuthSession() {
  return authSupabase.auth.refreshSession();
}

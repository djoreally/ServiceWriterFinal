/**
 * Auth commands - sign in, sign up, sign out
 */
import {
  AUTH_SUPABASE_PROJECT_ID_RESOLVED,
  authSupabase,
  productionSupabase,
  supabase,
} from "@/integrations/supabase/client";
import { isTransientBackendError } from "@/lib/transient-backend";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";

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
  if (error.status === 429 || message.includes("rate limit") || message.includes("over_email_send_rate_limit")) {
    return "Too many attempts. Please wait a few minutes before trying again or try signing in with your email and password.";
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
  if (message.includes("invalid login credentials") || message.includes("invalid_credentials")) {
    return "Invalid email or password. Please check your credentials and try again.";
  }
  if (message.includes("email not confirmed")) {
    return "Email address not confirmed. Please check your inbox for the confirmation link.";
  }
  return error.message || "Unable to sign in with those credentials.";
}

export async function signUpWithEmail(email: string, password: string): Promise<{ error?: string }> {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const normalizedEmail = email.trim().toLowerCase();
  const { error } = await authSupabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: { emailRedirectTo: `${origin}/dashboard` },
  });
  return error ? { error: error.message } : {};
}

export async function signInWithPassword(email: string, password: string): Promise<{ error?: string }> {
  // Credential exchange is a mutation guarded by Supabase's browser auth lock.
  // Never retry a timed-out promise that cannot be cancelled: the first call
  // may still complete and race the retry. The shared client transport owns
  // the single request deadline and abort signal.
  const normalizedEmail = email.trim().toLowerCase();
  let error: SignInError | null;
  try {
    const result = await authSupabase.auth.signInWithPassword({ email: normalizedEmail, password }) as PasswordSignInResponse;
    error = result.error;
  } catch (requestError) {
    error = {
      message: requestError instanceof Error ? requestError.message : "The sign-in request failed.",
      code: "request_timeout",
    };
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
  const normalizedEmail = email.trim().toLowerCase();
  const { error } = await authSupabase.auth.signInWithOtp({
    email: normalizedEmail,
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
  const normalizedEmail = email.trim().toLowerCase();
  // Supabase applies its server-side recovery rate limits. Callers intentionally
  // receive the same UI response whether or not the email is registered.
  await authSupabase.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo: `${origin}/reset-password`,
  });
}

export async function updatePassword(password: string): Promise<{ error?: string }> {
  const { error } = await authSupabase.auth.updateUser({ password });
  if (error) return { error: "This reset link is invalid or has expired. Request a new one." };
  void supabase.rpc("record_auth_security_event_v1", { p_event_type: "password_reset_completed" });
  return {};
}

export async function fetchOwnerDisplayName(): Promise<string | null> {
  try {
    const { data: { user } } = await authSupabase.auth.getUser();
    if (!user) return null;

    const selectedWorkspaceId = getSelectedWorkspaceId();
    let membershipQuery = productionSupabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("is_active", true);

    if (selectedWorkspaceId) {
      membershipQuery = membershipQuery.eq("workspace_id", selectedWorkspaceId);
    }

    let { data: membership, error: membershipError } = await membershipQuery.limit(1).maybeSingle();
    if (membershipError) throw membershipError;

    if (!membership && selectedWorkspaceId) {
      const fallback = await productionSupabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (fallback.error) throw fallback.error;
      membership = fallback.data;
    }

    if (!membership?.workspace_id) return null;

    const [{ data: settings, error: settingsError }, { data: workspace, error: workspaceError }] = await Promise.all([
      productionSupabase
        .from("workspace_settings")
        .select("owner_name")
        .eq("workspace_id", membership.workspace_id)
        .maybeSingle(),
      productionSupabase
        .from("workspaces")
        .select("name")
        .eq("id", membership.workspace_id)
        .maybeSingle(),
    ]);

    if (settingsError) throw settingsError;
    if (workspaceError) throw workspaceError;
    return settings?.owner_name || workspace?.name || null;
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

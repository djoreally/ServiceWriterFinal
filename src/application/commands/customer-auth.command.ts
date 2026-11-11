/**
 * Customer Auth Commands — Write operations for customer portal authentication.
 *
 * Pre-session auth wiring (sign-in / sign-up / password reset) intentionally
 * keeps the browser Supabase auth client: raw credentials must never travel
 * through a Hono endpoint. Only the post-session account-linking RPC is
 * relocated behind the API boundary.
 */
import { authSupabase } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";

export async function signInCustomer(email: string, password: string) {
  return authSupabase.auth.signInWithPassword({ email, password });
}

export async function signUpCustomer(
  email: string,
  password: string,
  name: string,
  phone?: string,
  redirectTo?: string,
) {
  return authSupabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectTo,
      data: {
        full_name: name,
        phone,
        servicewriter_portal: "customer",
      },
    },
  });
}

/**
 * Link the authenticated Supabase user to every canonical customer record that
 * belongs to their verified email. The legacy create_customer_account RPC and
 * customer_accounts table are retired.
 */
export async function createCustomerAccount(
  _userId: string,
  _email: string,
  _name?: string,
  _phone?: string,
  _providerId?: string | null,
) {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) {
    // Email-confirmation signups do not have an authenticated session yet.
    // CustomerDashboard links the account immediately after confirmation.
    return { data: null, error: null };
  }

  const { data } = await apiClient.post<{ data: unknown[] }>("/v1/crm/customer-portal/accounts/link", {});
  return { data, error: null };
}

export async function resetPassword(email: string, redirectTo: string) {
  return authSupabase.auth.resetPasswordForEmail(email, { redirectTo });
}

/**
 * Set a new password for the user holding the current session. Used by the
 * customer recovery flow: a password-reset email link lands back on
 * CustomerAuth with a short-lived recovery session, and this is the only
 * moment the new password may be written.
 */
export async function updateCustomerPassword(password: string) {
  return authSupabase.auth.updateUser({ password });
}

/** End the current (recovery) session so the new password must be proven at sign-in. */
export async function signOutCustomer() {
  return authSupabase.auth.signOut();
}

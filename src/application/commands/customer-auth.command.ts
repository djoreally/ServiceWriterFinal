/**
 * Customer Auth Commands — Write operations for customer portal authentication.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { authSupabase, supabase } from "@/integrations/supabase/client";

const canonicalSupabase = supabase as unknown as SupabaseClient;

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
  const { data: { session } } = await authSupabase.auth.getSession();
  if (!session) {
    // Email-confirmation signups do not have an authenticated session yet.
    // CustomerDashboard links the account immediately after confirmation.
    return { data: null, error: null };
  }

  const result = await canonicalSupabase.rpc("link_customer_portal_account_v1");
  if (result.error) throw result.error;
  return result;
}

export async function resetPassword(email: string, redirectTo: string) {
  return authSupabase.auth.resetPasswordForEmail(email, { redirectTo });
}

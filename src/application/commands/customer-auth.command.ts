/**
 * Customer Auth Commands — Write operations for customer portal authentication.
 */
import { authSupabase, supabase } from "@/integrations/supabase/client";

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
      data: { full_name: name, phone },
    },
  });
}

export async function createCustomerAccount(
  userId: string,
  email: string,
  name?: string,
  phone?: string,
  providerId?: string | null,
) {
  return supabase.rpc("create_customer_account", {
    p_user_id: userId,
    p_email: email,
    p_full_name: name || undefined,
    p_phone: phone || undefined,
    p_provider_id: providerId || null,
  });
}

export async function resetPassword(email: string, redirectTo: string) {
  return authSupabase.auth.resetPasswordForEmail(email, { redirectTo });
}

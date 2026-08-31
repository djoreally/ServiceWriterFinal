/**
 * Payment Provider Commands — Write operations for payment provider settings.
 */
import { supabase } from "@/integrations/supabase/client";

export async function updatePaymentProvider(provider: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("business_profiles")
    .update({ payment_provider: provider })
    .eq("user_id", session.user.id);

  if (error) throw new Error(error.message);
}

export async function initiateStripeOnboarding() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  return supabase.functions.invoke("stripe-connect-onboard", {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
}

export async function initiateSquareOnboarding() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  return supabase.functions.invoke("square-connect-onboard", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: { mode: "initiate" },
  });
}

export async function completeSquareCallback(code: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  return supabase.functions.invoke("square-connect-onboard", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: { mode: "callback", code },
  });
}

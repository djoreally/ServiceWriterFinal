/**
 * Payment Provider Query — Read operations for payment provider settings.
 */
import { supabase } from "@/integrations/supabase/client";

export async function fetchPaymentProvider() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const headers = { Authorization: `Bearer ${session.access_token}` };

  const [profileResp, stripeResp, squareResp] = await Promise.all([
    supabase
      .from("business_profiles")
      .select("payment_provider")
      .eq("user_id", session.user.id)
      .single(),
    supabase.functions.invoke("stripe-connect-status", { headers }),
    supabase.functions.invoke("square-connect-status", { headers }),
  ]);

  return {
    provider: profileResp.data?.payment_provider ?? null,
    stripeStatus: stripeResp.data,
    squareStatus: squareResp.data,
  };
}

/** Payment Provider Query — canonical workspace payment-provider settings. */
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export async function fetchPaymentProvider() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const context = await resolveCurrentWorkspace();
  if (!context) return null;

  const headers = { Authorization: `Bearer ${session.access_token}` };

  const [settingsResp, stripeResp, squareResp] = await Promise.all([
    (supabase as any)
      .from("workspace_settings")
      .select("payment_provider")
      .eq("workspace_id", context.workspaceId)
      .maybeSingle(),
    supabase.functions.invoke("stripe-connect-status", { headers }),
    supabase.functions.invoke("square-connect-status", { headers }),
  ]);

  if (settingsResp.error) throw settingsResp.error;

  return {
    provider: settingsResp.data?.payment_provider ?? null,
    stripeStatus: stripeResp.data,
    squareStatus: squareResp.data,
  };
}

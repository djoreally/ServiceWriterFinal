/** Payment Provider Commands — canonical workspace-scoped provider writes. */
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export async function updatePaymentProvider(provider: string) {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Select a workspace before updating the payment provider.");
  if (!["stripe", "square", "none"].includes(provider)) throw new Error("Unsupported payment provider");

  // Generated Supabase types still lag the canonical workspace_settings schema.
  const db = supabase as any;
  const { error } = await db
    .from("workspace_settings")
    .update({ payment_provider: provider })
    .eq("workspace_id", context.workspaceId);
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

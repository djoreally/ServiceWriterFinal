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

async function invokeProvider(provider: "stripe" | "square", mode: "initiate" | "callback" | "status", extra: Record<string, unknown> = {}) {
  const [{ data: { session } }, context] = await Promise.all([
    supabase.auth.getSession(),
    resolveCurrentWorkspace(),
  ]);
  if (!session) throw new Error("Not authenticated");
  if (!context) throw new Error("Select a workspace before connecting a payment provider.");

  const { data, error } = await supabase.functions.invoke("payment-provider-connect", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: { workspace_id: context.workspaceId, provider, mode, ...extra },
  });

  if (error) {
    const response = (error as { context?: { text?: () => Promise<string> } }).context;
    if (response?.text) {
      const raw = await response.text().catch(() => "");
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { error?: string };
          if (parsed.error) throw new Error(parsed.error);
        } catch (caught) {
          if (caught instanceof Error && !(caught instanceof SyntaxError)) throw caught;
        }
      }
    }
    throw new Error(error.message || `${provider} connection request failed`);
  }
  if (data?.error) throw new Error(String(data.error));
  return { data, error: null };
}

export async function initiateStripeOnboarding() {
  return invokeProvider("stripe", "initiate");
}

export async function completeStripeCallback(code: string, state: string) {
  return invokeProvider("stripe", "callback", { code, state });
}

export async function refreshStripeConnection() {
  return invokeProvider("stripe", "status");
}

export async function initiateSquareOnboarding() {
  return invokeProvider("square", "initiate");
}

export async function completeSquareCallback(code: string, state: string) {
  return invokeProvider("square", "callback", { code, state });
}

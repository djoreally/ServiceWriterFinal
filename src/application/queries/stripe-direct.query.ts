import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface StripeDirectStatus {
  mode: "connect" | "direct";
  configured: boolean;
  accountId: string | null;
  keyLast4: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  webhookConfigured: boolean;
  checkedAt: string | null;
}

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Please sign in to manage Stripe");
  return {
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  };
}

async function currentWorkspaceId() {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("No active workspace");
  return context.workspaceId;
}

async function parseResponse(response: Response): Promise<StripeDirectStatus> {
  const payload = await response.json().catch(() => null) as { data?: StripeDirectStatus; error?: { message?: string } } | null;
  if (!response.ok || !payload?.data) {
    throw new Error(payload?.error?.message || "Stripe configuration request failed");
  }
  return payload.data;
}

export async function fetchStripeDirectStatus(): Promise<StripeDirectStatus> {
  const workspaceId = await currentWorkspaceId();
  const response = await fetch(`/api/v1/payments/stripe-direct?workspace_id=${encodeURIComponent(workspaceId)}`, {
    headers: await authHeaders(),
  });
  return parseResponse(response);
}

export async function configureStripeDirect(accountId: string, secretKey: string, webhookSecret: string): Promise<StripeDirectStatus> {
  const workspaceId = await currentWorkspaceId();
  const response = await fetch("/api/v1/payments/stripe-direct", {
    method: "PUT",
    headers: await authHeaders(),
    body: JSON.stringify({
      workspace_id: workspaceId,
      account_id: accountId,
      secret_key: secretKey,
      webhook_secret: webhookSecret,
    }),
  });
  return parseResponse(response);
}

export async function disconnectStripeDirect(): Promise<StripeDirectStatus> {
  const workspaceId = await currentWorkspaceId();
  const response = await fetch(`/api/v1/payments/stripe-direct?workspace_id=${encodeURIComponent(workspaceId)}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  return parseResponse(response);
}

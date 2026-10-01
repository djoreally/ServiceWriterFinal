/** Payment Provider Commands — canonical workspace-scoped provider writes via the Hono billing API. */
import { apiClient, ApiClientError } from "@/lib/api-client";

export async function updatePaymentProvider(provider: string) {
  if (!["stripe", "square", "none"].includes(provider)) throw new Error("Unsupported payment provider");
  try {
    await apiClient.put("/v1/billing/payment-provider", { provider });
  } catch (error) {
    throw new Error(error instanceof ApiClientError ? error.message : "Failed to update payment provider");
  }
}

async function invokeProvider(provider: "stripe" | "square", mode: "initiate" | "callback" | "status", extra: Record<string, unknown> = {}) {
  try {
    // The Hono endpoint resolves the workspace server-side from the auth
    // token and forwards the session to the legacy edge function; the raw
    // edge-function payload is returned verbatim.
    const data = await apiClient.post<{
      url?: string;
      error?: string;
      [key: string]: unknown;
    }>("/v1/billing/payment-provider/connect", {
      provider,
      mode,
      ...extra,
    });
    if (data?.error) throw new Error(String(data.error));
    return { data, error: null };
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) throw new Error("Not authenticated");
    throw new Error(error instanceof ApiClientError ? error.message : `${provider} connection request failed`);
  }
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

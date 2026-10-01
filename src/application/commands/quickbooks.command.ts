/**
 * QuickBooks Commands — Write operations for QBO integration via the Hono billing API.
 */
import { apiClient, ApiClientError } from "@/lib/api-client";

function toError(error: unknown): Error {
  if (error instanceof ApiClientError && error.status === 401) return new Error("Not authenticated");
  return new Error(error instanceof ApiClientError ? error.message : "QuickBooks request failed");
}

export async function saveQBOSettings(settings: {
  qbo_sync_customers: boolean;
  qbo_sync_invoices: boolean;
  qbo_sync_payments: boolean;
  qbo_income_account_id: string | null;
}) {
  try {
    await apiClient.put("/v1/billing/qbo/settings", settings);
    return { data: null, error: null };
  } catch (error) {
    throw toError(error);
  }
}

export async function invokeQBOConnect() {
  try {
    const data = await apiClient.post<{ authUrl?: string }>("/v1/billing/qbo/connect", {});
    return { data, error: null };
  } catch (error) {
    throw toError(error);
  }
}

export async function invokeQBODisconnect() {
  try {
    const data = await apiClient.post<Record<string, unknown>>("/v1/billing/qbo/disconnect", {});
    return { data, error: null };
  } catch (error) {
    throw toError(error);
  }
}

export async function invokeQBOSync(entityType?: string) {
  try {
    const data = await apiClient.post<{ message?: string }>("/v1/billing/qbo/sync", {
      entity_type: entityType || "all",
    });
    return { data, error: null };
  } catch (error) {
    throw toError(error);
  }
}

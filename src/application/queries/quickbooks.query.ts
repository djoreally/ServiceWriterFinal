/**
 * QuickBooks Query — Read operations for QBO integration settings via the Hono billing API.
 */
import { apiClient, ApiClientError } from "@/lib/api-client";

export interface QBOData {
  profile: {
    qbo_enabled: boolean | null;
    qbo_realm_id: string | null;
    qbo_connected_at: string | null;
    qbo_sync_customers: boolean | null;
    qbo_sync_invoices: boolean | null;
    qbo_sync_payments: boolean | null;
    qbo_income_account_id: string | null;
    qbo_last_sync_at: string | null;
  } | null;
  syncLogs: Record<string, unknown>[];
  entityStats: {
    customers: number;
    invoices: number;
    payments: number;
  };
}

export async function fetchQBOData(): Promise<QBOData | null> {
  try {
    const { data } = await apiClient.get<{ data: QBOData }>("/v1/billing/qbo");
    return data;
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) return null;
    throw error instanceof ApiClientError ? new Error(error.message) : error;
  }
}

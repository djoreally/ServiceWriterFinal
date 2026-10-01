import { apiClient } from "@/lib/api-client";

export interface ProviderRewardsLedgerFilters {
  providerId: string;
  customerId?: string | null;
  appointmentId?: string | null;
  eventType?: string | null;
  from?: string | null;
  to?: string | null;
  limit?: number;
  offset?: number;
}

export interface ProviderRewardsLedgerResult {
  status: string;
  rows: Array<Record<string, unknown>>;
  reason?: string;
}

export async function fetchProviderRewardsLedger(filters: ProviderRewardsLedgerFilters): Promise<ProviderRewardsLedgerResult> {
  const { data } = await apiClient.get<{ data: ProviderRewardsLedgerResult }>("/v1/crm/loyalty/ledger", {
    query: {
      provider_id: filters.providerId,
      ...(filters.customerId ? { customer_id: filters.customerId } : {}),
      ...(filters.appointmentId ? { appointment_id: filters.appointmentId } : {}),
      ...(filters.eventType ? { event_type: filters.eventType } : {}),
      ...(filters.from ? { from: filters.from } : {}),
      ...(filters.to ? { to: filters.to } : {}),
      limit: String(filters.limit ?? 200),
      offset: String(filters.offset ?? 0),
    },
  });
  return {
    status: data?.status || "ok",
    rows: data?.rows || [],
    reason: data?.reason,
  };
}

export async function fetchRewardsOperationsSummary(providerId: string): Promise<Record<string, unknown>> {
  const { data } = await apiClient.get<{ data: Record<string, unknown> }>("/v1/crm/loyalty/operations-summary", {
    query: { provider_id: providerId },
  });
  return (data || {}) as Record<string, unknown>;
}

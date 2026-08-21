import { supabase } from "@/integrations/supabase/client";

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
  const { data, error } = await supabase.rpc("get_provider_rewards_ledger", {
    p_provider_id: filters.providerId,
    p_customer_id: filters.customerId ?? undefined,
    p_appointment_id: filters.appointmentId ?? undefined,
    p_event_type: filters.eventType as never,
    p_from: filters.from ?? undefined,
    p_to: filters.to ?? undefined,
    p_limit: filters.limit ?? 200,
    p_offset: filters.offset ?? 0,
  });
  if (error) throw new Error(error.message);
  const payload = (data || {}) as { status?: string; rows?: Array<Record<string, unknown>>; reason?: string };
  return {
    status: payload.status || "ok",
    rows: payload.rows || [],
    reason: payload.reason,
  };
}

export async function fetchRewardsOperationsSummary(providerId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc("get_rewards_operations_summary", { p_provider_id: providerId });
  if (error) throw new Error(error.message);
  return (data || {}) as Record<string, unknown>;
}

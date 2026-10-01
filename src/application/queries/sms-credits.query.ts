/**
 * SMS Credits Query — prepaid message credit balance, bundle catalog,
 * and purchase history for the Messaging settings card.
 */
import { apiClient, ApiClientError } from "@/lib/api-client";

export interface SmsCreditBalance {
  included_units: number;
  purchased_units: number;
  used_units: number;
  reserved_units: number;
  available: number;
  period_start: string | null;
  period_end: string | null;
  low_balance_threshold: number;
  transactional_enabled: boolean;
  marketing_enabled: boolean;
}

export interface SmsBundle {
  bundle_key: string;
  name: string;
  credit_units: number;
  price_cents: number;
  renewal_period: string;
}

export interface SmsCreditPurchase {
  id: string;
  bundle_key: string;
  units: number;
  kind: string;
  amount_cents: number | null;
  created_at: string;
}

const EMPTY_BALANCE: SmsCreditBalance = {
  included_units: 0,
  purchased_units: 0,
  used_units: 0,
  reserved_units: 0,
  available: 0,
  period_start: null,
  period_end: null,
  low_balance_threshold: 50,
  transactional_enabled: true,
  marketing_enabled: false,
};

export async function fetchSmsCreditBalance(): Promise<SmsCreditBalance> {
  try {
    const { data } = await apiClient.get<{ data: Partial<SmsCreditBalance> | null }>("/v1/sms-credits/balance");
    return { ...EMPTY_BALANCE, ...(data ?? {}) };
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) return EMPTY_BALANCE;
    throw error;
  }
}

export async function fetchSmsBundles(): Promise<SmsBundle[]> {
  const { data } = await apiClient.get<{ data: SmsBundle[] }>("/v1/sms-credits/bundles");
  return data ?? [];
}

export async function fetchSmsCreditPurchases(): Promise<SmsCreditPurchase[]> {
  const { data } = await apiClient.get<{ data: SmsCreditPurchase[] }>("/v1/sms-credits/purchases");
  return data ?? [];
}

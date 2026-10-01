/**
 * Cash Drawer Query — Read-only data access for cash drawer management via the Hono billing API.
 * All write operations have been moved to cash-drawer.command.ts.
 */
import { apiClient, ApiClientError } from "@/lib/api-client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface CashDrawerConfig {
  port?: string;
  ip_address?: string;
  printer_name?: string;
  kick_code?: string;
  stripe_reader_id?: string;
  stripe_location_id?: string;
}

export interface CashDrawerSettings {
  cash_drawer_enabled: boolean;
  cash_drawer_type: string;
  cash_drawer_config: CashDrawerConfig;
  cash_drawer_open_on_cash_payment: boolean;
  cash_drawer_require_reason: boolean;
}

export interface CashDrawerEvent {
  id: string;
  event_type: string;
  trigger_type: string;
  amount: number | null;
  payment_method: string | null;
  reason: string | null;
  opened_by: string | null;
  created_at: string;
}

export interface CashDrawerSession {
  id: string;
  started_at: string;
  ended_at: string | null;
  opening_amount: number;
  closing_amount: number | null;
  expected_closing: number | null;
  cash_in_total: number;
  cash_out_total: number;
  cash_sales_total: number;
  variance: number | null;
  variance_reason: string | null;
  staff_name: string | null;
  status: string;
}

interface CashDrawerBundle {
  profile: Record<string, unknown> | null;
  events: CashDrawerEvent[];
  sessions: CashDrawerSession[];
}

export async function fetchCashDrawerData(userId: string) {
  let bundle: CashDrawerBundle;
  try {
    const response = await apiClient.get<{ data: CashDrawerBundle }>("/v1/billing/cash-drawer");
    bundle = response.data;
  } catch (error) {
    throw error instanceof ApiClientError ? new Error(error.message) : error;
  }

  const profile = bundle.profile ?? {};
  const settings: CashDrawerSettings = {
    cash_drawer_enabled: Boolean(profile.cash_drawer_enabled),
    cash_drawer_type: (profile.cash_drawer_type as string) ?? "none",
    cash_drawer_config: (profile.cash_drawer_config as CashDrawerConfig) ?? {},
    cash_drawer_open_on_cash_payment: (profile.cash_drawer_open_on_cash_payment as boolean) ?? true,
    cash_drawer_require_reason: Boolean(profile.cash_drawer_require_reason),
  };

  const sessions = bundle.sessions ?? [];
  const activeSession = sessions.find(s => s.status === "open") || null;

  return {
    settings,
    stripeConnected: Boolean(profile.stripe_charges_enabled),
    events: bundle.events ?? [],
    sessions,
    activeSession,
  };
}

export async function discoverStripeTerminalReaders(): Promise<Array<{ id: string; label: string; status: string }>> {
  try {
    const response = await apiClient.post<{ readers?: Array<{ id: string; label?: string; status: string }> }>(
      "/v1/billing/stripe-terminal-readers",
      {},
    );
    return (response.readers || []).map((r) => ({
      id: r.id,
      label: r.label || r.id,
      status: r.status,
    }));
  } catch (error) {
    throw error instanceof ApiClientError ? new Error(error.message) : error;
  }
}

export async function getCurrentUserId(): Promise<string | null> {
  const { data: { user } } = await getCurrentAuthUser();
  return user?.id ?? null;
}

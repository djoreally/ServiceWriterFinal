/**
 * Cash Drawer Query — Read-only data access for cash drawer management.
 * All write operations have been moved to cash-drawer.command.ts.
 */
import { supabase } from "@/integrations/supabase/client";

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

export async function fetchCashDrawerData(userId: string) {
  const [profileRes, eventsRes, sessionsRes] = await Promise.all([
    supabase
      .from("business_profiles")
      .select("cash_drawer_enabled, cash_drawer_type, cash_drawer_config, cash_drawer_open_on_cash_payment, cash_drawer_require_reason, stripe_charges_enabled")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("cash_drawer_events")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("cash_drawer_sessions")
      .select("*")
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(10),
  ]);

  const profile = profileRes.data;
  const settings: CashDrawerSettings = {
    cash_drawer_enabled: profile?.cash_drawer_enabled ?? false,
    cash_drawer_type: profile?.cash_drawer_type ?? "none",
    cash_drawer_config: (profile?.cash_drawer_config as CashDrawerConfig) ?? {},
    cash_drawer_open_on_cash_payment: profile?.cash_drawer_open_on_cash_payment ?? true,
    cash_drawer_require_reason: profile?.cash_drawer_require_reason ?? false,
  };

  const sessions = (sessionsRes.data ?? []) as CashDrawerSession[];
  const activeSession = sessions.find(s => s.status === "open") || null;

  return {
    settings,
    stripeConnected: profile?.stripe_charges_enabled ?? false,
    events: (eventsRes.data ?? []) as CashDrawerEvent[],
    sessions,
    activeSession,
  };
}

export async function discoverStripeTerminalReaders(): Promise<Array<{ id: string; label: string; status: string }>> {
  const response = await supabase.functions.invoke("stripe-terminal-readers", {
    body: { action: "list" },
  });
  if (response.error) throw new Error(response.error.message);
  return (response.data?.readers || []).map((r: any) => ({
    id: r.id,
    label: r.label || r.id,
    status: r.status,
  }));
}

export async function getCurrentUserId(): Promise<string | null> {
  const { data: { user } } = await getCurrentAuthUser();
  return user?.id ?? null;
}

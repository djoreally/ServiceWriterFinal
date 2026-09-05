/** Cash Drawer Query — canonical workspace settings plus existing cash ledgers. */
import { supabase, productionSupabase } from "@/integrations/supabase/client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface CashDrawerConfig { port?: string; ip_address?: string; printer_name?: string; kick_code?: string; stripe_reader_id?: string; stripe_location_id?: string }
export interface CashDrawerSettings { cash_drawer_enabled: boolean; cash_drawer_type: string; cash_drawer_config: CashDrawerConfig; cash_drawer_open_on_cash_payment: boolean; cash_drawer_require_reason: boolean }
export interface CashDrawerEvent { id: string; event_type: string; trigger_type: string; amount: number | null; payment_method: string | null; reason: string | null; opened_by: string | null; created_at: string }
export interface CashDrawerSession { id: string; started_at: string; ended_at: string | null; opening_amount: number; closing_amount: number | null; expected_closing: number | null; cash_in_total: number; cash_out_total: number; cash_sales_total: number; variance: number | null; variance_reason: string | null; staff_name: string | null; status: string }

function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

export async function fetchCashDrawerData(userId: string) {
  const context = await resolveCurrentWorkspace();
  if (!context) return null;
  const [settingsRes, eventsRes, sessionsRes] = await Promise.all([
    productionSupabase.from("workspace_settings").select("operational_settings").eq("workspace_id", context.workspaceId).maybeSingle(),
    supabase.from("cash_drawer_events").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
    supabase.from("cash_drawer_sessions").select("*").eq("user_id", userId).order("started_at", { ascending: false }).limit(10),
  ]);
  if (settingsRes.error) throw settingsRes.error;
  const operational = object(settingsRes.data?.operational_settings);
  const settings: CashDrawerSettings = {
    cash_drawer_enabled: operational.cash_drawer_enabled === true,
    cash_drawer_type: typeof operational.cash_drawer_type === "string" ? operational.cash_drawer_type : "none",
    cash_drawer_config: object(operational.cash_drawer_config) as CashDrawerConfig,
    cash_drawer_open_on_cash_payment: operational.cash_drawer_open_on_cash_payment !== false,
    cash_drawer_require_reason: operational.cash_drawer_require_reason === true,
  };
  const sessions = (sessionsRes.data ?? []) as CashDrawerSession[];
  return { settings, stripeConnected: operational.stripe_charges_enabled === true, events: (eventsRes.data ?? []) as CashDrawerEvent[], sessions, activeSession: sessions.find(s => s.status === "open") || null };
}

export async function discoverStripeTerminalReaders(): Promise<Array<{ id: string; label: string; status: string }>> {
  const response = await supabase.functions.invoke("stripe-terminal-readers", { body: { action: "list" } });
  if (response.error) throw new Error(response.error.message);
  return (response.data?.readers || []).map((r: any) => ({ id: r.id, label: r.label || r.id, status: r.status }));
}
export async function getCurrentUserId(): Promise<string | null> { const { data: { user } } = await getCurrentAuthUser(); return user?.id ?? null; }

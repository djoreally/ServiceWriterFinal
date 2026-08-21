/**
 * Cash Drawer Commands — All write operations for cash drawer management.
 * Extracted from cash-drawer.query.ts to enforce command/query separation.
 */
import { supabase } from "@/integrations/supabase/client";
import type { CashDrawerSettings, CashDrawerSession } from "@/application/queries/cash-drawer.query";

export async function saveCashDrawerSettings(userId: string, settings: CashDrawerSettings): Promise<void> {
  const { error } = await supabase
    .from("business_profiles")
    .update({
      cash_drawer_enabled: settings.cash_drawer_enabled,
      cash_drawer_type: settings.cash_drawer_type,
      cash_drawer_config: settings.cash_drawer_config as any,
      cash_drawer_open_on_cash_payment: settings.cash_drawer_open_on_cash_payment,
      cash_drawer_require_reason: settings.cash_drawer_require_reason,
    })
    .eq("user_id", userId);
  if (error) throw error;
}

export async function logCashDrawerEvent(params: {
  eventType: string;
  triggerType: string;
  amount?: number;
  reason?: string;
  paymentMethod?: string;
}): Promise<void> {
  const { error } = await supabase.rpc("log_cash_drawer_event", {
    p_event_type: params.eventType,
    p_trigger_type: params.triggerType,
    p_amount: params.amount ?? null,
    p_reason: params.reason ?? null,
    p_payment_method: params.paymentMethod ?? null,
  });
  if (error) throw error;
}

export async function startCashDrawerSession(userId: string, openingAmount: number, staffName?: string): Promise<CashDrawerSession> {
  const { data, error } = await supabase
    .from("cash_drawer_sessions")
    .insert({
      user_id: userId,
      opening_amount: openingAmount,
      staff_name: staffName || null,
      status: "open",
    })
    .select()
    .single();
  if (error) throw error;
  return data as CashDrawerSession;
}

export async function endCashDrawerSession(
  sessionId: string,
  closingAmount: number,
  expectedClosing: number,
  varianceReason?: string,
): Promise<void> {
  const variance = closingAmount - expectedClosing;
  const { error } = await supabase
    .from("cash_drawer_sessions")
    .update({
      ended_at: new Date().toISOString(),
      closing_amount: closingAmount,
      expected_closing: expectedClosing,
      variance,
      variance_reason: Math.abs(variance) > 0.01 ? varianceReason : null,
      status: "closed",
    })
    .eq("id", sessionId);
  if (error) throw error;
}

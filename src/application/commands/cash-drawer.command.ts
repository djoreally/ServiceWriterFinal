/**
 * Cash Drawer Commands — All write operations for cash drawer management.
 * Extracted from cash-drawer.query.ts to enforce command/query separation.
 * The user identity is resolved server-side from the auth token.
 */
import { apiClient, ApiClientError } from "@/lib/api-client";
import type { CashDrawerSettings, CashDrawerSession } from "@/application/queries/cash-drawer.query";

function toError(error: unknown): Error {
  return new Error(error instanceof ApiClientError ? error.message : "Cash drawer request failed");
}

export async function saveCashDrawerSettings(userId: string, settings: CashDrawerSettings): Promise<void> {
  try {
    await apiClient.put("/v1/billing/cash-drawer/settings", {
      cash_drawer_enabled: settings.cash_drawer_enabled,
      cash_drawer_type: settings.cash_drawer_type,
      cash_drawer_config: settings.cash_drawer_config ?? {},
      cash_drawer_open_on_cash_payment: settings.cash_drawer_open_on_cash_payment,
      cash_drawer_require_reason: settings.cash_drawer_require_reason,
    });
  } catch (error) {
    throw toError(error);
  }
}

export async function logCashDrawerEvent(params: {
  eventType: string;
  triggerType: string;
  amount?: number;
  reason?: string;
  paymentMethod?: string;
}): Promise<void> {
  try {
    await apiClient.post("/v1/billing/cash-drawer/events", {
      event_type: params.eventType,
      trigger_type: params.triggerType,
      amount: params.amount ?? null,
      reason: params.reason ?? null,
      payment_method: params.paymentMethod ?? null,
    });
  } catch (error) {
    throw toError(error);
  }
}

export async function startCashDrawerSession(userId: string, openingAmount: number, staffName?: string): Promise<CashDrawerSession> {
  try {
    const { data } = await apiClient.post<{ data: CashDrawerSession }>("/v1/billing/cash-drawer/sessions", {
      opening_amount: openingAmount,
      staff_name: staffName ?? null,
    });
    return data;
  } catch (error) {
    throw toError(error);
  }
}

export async function endCashDrawerSession(
  sessionId: string,
  closingAmount: number,
  expectedClosing: number,
  varianceReason?: string,
): Promise<void> {
  try {
    await apiClient.patch(`/v1/billing/cash-drawer/sessions/${sessionId}`, {
      closing_amount: closingAmount,
      expected_closing: expectedClosing,
      variance_reason: varianceReason ?? null,
    });
  } catch (error) {
    throw toError(error);
  }
}

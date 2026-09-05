/**
 * QuickBooks integration has been sunset.
 *
 * These compatibility exports intentionally perform no provider or database I/O.
 * They fail closed so stale callers cannot silently reactivate the retired integration.
 */
const SUNSET_ERROR = "QuickBooks integration has been retired";

export async function saveQBOSettings(_settings: {
  qbo_sync_customers: boolean;
  qbo_sync_invoices: boolean;
  qbo_sync_payments: boolean;
  qbo_income_account_id: string | null;
}) {
  return { data: null, error: new Error(SUNSET_ERROR) };
}

export async function invokeQBOConnect() {
  return { data: null, error: new Error(SUNSET_ERROR) };
}

export async function invokeQBODisconnect() {
  return { data: null, error: new Error(SUNSET_ERROR) };
}

export async function invokeQBOSync(_entityType?: string) {
  return { data: null, error: new Error(SUNSET_ERROR) };
}

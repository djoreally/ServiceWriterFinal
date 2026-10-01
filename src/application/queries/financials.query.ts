/** Financials Query — canonical payment/service reads with legacy chart adapters, via the Hono billing API. */
import { apiClient, ApiClientError } from "@/lib/api-client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface FinancialOverviewData {
  totalRevenue: number; lastMonthRevenue: number; totalTransactions: number; avgTicketSize: number;
  outstandingPayments: number; totalPending: number; collectionRate: number;
  monthlyRevenue: { month: string; revenue: number }[];
  paymentMethods: { method: string; amount: number; percentage: number }[];
}

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function cents(value: unknown): number {
  return Math.round((Number(value) || 0) * 100);
}

export async function getCurrentUserId(): Promise<string | null> {
  const { data: { user } } = await getCurrentAuthUser();
  return user?.id ?? null;
}

interface SucceededPaymentRow {
  id: string;
  amount: number | null;
  status: string;
  provider: string | null;
  paid_at: string | null;
  created_at: string;
  metadata: unknown;
}

/**
 * Final stores payment amounts in dollars. This adapter returns cents because
 * the legacy Financials chart/currency utilities explicitly consume cents.
 * Settled revenue is periodized by paid_at, never payment creation time.
 */
export async function fetchSucceededPayments(_userId: string, sinceIso: string) {
  const context = await resolveCurrentWorkspace();
  if (!context) return { data: [], error: null };
  try {
    const { data } = await apiClient.get<{ data: SucceededPaymentRow[] }>("/v1/billing/financials/succeeded-payments", {
      query: { since: sinceIso },
    });
    return {
      data: (data ?? []).map((row) => {
        const metadata = object(row.metadata);
        const refundDollars = row.status === "refunded"
          ? Number(metadata.refunded_amount ?? row.amount ?? 0)
          : Number(metadata.refunded_amount ?? 0);
        return {
          id: row.id,
          amount: cents(row.amount),
          refund_amount: cents(refundDollars),
          status: row.status,
          created_at: row.paid_at ?? row.created_at,
          payment_type: metadata.payment_type ?? metadata.payment_method ?? row.provider ?? "card",
          appointment_id: metadata.appointment_id ?? null,
        };
      }),
      error: null,
    };
  } catch (error) {
    return { data: null, error: error instanceof ApiClientError ? new Error(error.message) : error };
  }
}

interface PendingPaymentRow {
  id: string;
  amount: number | null;
  metadata: unknown;
}

/** Pending payments returned in legacy cents for aggregatePayments(). */
export async function fetchPendingPayments(_userId: string) {
  const context = await resolveCurrentWorkspace();
  if (!context) return { data: [], error: null };
  try {
    const { data } = await apiClient.get<{ data: PendingPaymentRow[] }>("/v1/billing/financials/pending-payments");
    return {
      data: (data ?? []).map((row) => ({
        id: row.id,
        amount: cents(row.amount),
        appointment_id: object(row.metadata).appointment_id ?? null,
      })),
      error: null,
    };
  } catch (error) {
    return { data: null, error: error instanceof ApiClientError ? new Error(error.message) : error };
  }
}

export async function fetchAppointmentStatuses(appointmentIds: string[]) {
  const context = await resolveCurrentWorkspace();
  if (!context || appointmentIds.length === 0) return { data: [], error: null };
  try {
    const query = appointmentIds.map((id) => `appointment_id=${encodeURIComponent(id)}`).join("&");
    const { data } = await apiClient.get<{ data: Array<{ id: string; status: string }> }>(
      `/v1/billing/financials/appointment-statuses?${query}`,
    );
    return { data: data ?? [], error: null };
  } catch (error) {
    return { data: [], error: error instanceof ApiClientError ? new Error(error.message) : error };
  }
}

interface CompletedServiceRow {
  id: string;
  total_amount: number | null;
  tax_amount: number | null;
  discount_amount: number | null;
  status: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  metadata: unknown;
}

/** Completed job snapshots remain dollars because canonical service financial helpers consume dollars. */
export async function fetchCompletedServices(_userId: string, sinceIso: string) {
  const context = await resolveCurrentWorkspace();
  if (!context) return { data: [], error: null };
  try {
    const { data } = await apiClient.get<{ data: CompletedServiceRow[] }>("/v1/billing/financials/completed-services", {
      query: { since: sinceIso },
    });
    return {
      data: (data ?? []).map((row) => {
        const metadata = object(row.metadata);
        return {
          id: row.id,
          total_cost: Number(row.total_amount ?? metadata.total_cost ?? 0),
          tax_amount: row.tax_amount == null ? 0 : Number(row.tax_amount),
          discount_amount: row.discount_amount == null ? 0 : Number(row.discount_amount),
          shop_supplies: Number(metadata.shop_supplies ?? 0),
          paid_amount: Number(metadata.paid_amount ?? 0),
          payment_status: metadata.payment_status ?? null,
          status: row.status,
          service_date: row.completed_at ?? row.created_at,
          updated_at: row.updated_at,
        };
      }),
      error: null,
    };
  } catch (error) {
    return { data: null, error: error instanceof ApiClientError ? new Error(error.message) : error };
  }
}

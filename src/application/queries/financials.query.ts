/** Financials Query — shared session helper plus the settled-payments read
 * used by payment surfaces (e.g. AppointmentDetail), via the Hono billing
 * API. The Financials Overview no longer computes payments-only math here;
 * it reads the Accounting warehouse (bank transactions + invoice book). */
import { apiClient, ApiClientError } from "@/lib/api-client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

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
      data: (data ?? [])
        .map((row) => {
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
        })
        // A payment without any usable date cannot be placed on a time chart;
        // drop it here instead of crashing format(parseISO(...)) downstream.
        .filter((payment) => !!payment.created_at),
      error: null,
    };
  } catch (error) {
    return { data: null, error: error instanceof ApiClientError ? new Error(error.message) : error };
  }
}

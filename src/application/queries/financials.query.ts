/** Financials Query — canonical payment/service reads with legacy chart adapters. */
import { productionSupabase } from "@/integrations/supabase/client";
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

/**
 * Final stores payment amounts in dollars. This adapter returns cents because
 * the legacy Financials chart/currency utilities explicitly consume cents.
 */
export async function fetchSucceededPayments(_userId: string, sinceIso: string) {
  const context = await resolveCurrentWorkspace();
  if (!context) return { data: [], error: null };
  const { data, error } = await productionSupabase.from("payments")
    .select("id,amount,status,provider,paid_at,created_at,metadata")
    .eq("workspace_id", context.workspaceId)
    .in("status", ["succeeded", "partially_refunded", "refunded"])
    .gte("created_at", sinceIso)
    .order("created_at");
  if (error) return { data: null, error };
  return {
    data: (data ?? []).map((row) => {
      const metadata = object(row.metadata);
      return {
        id: row.id,
        amount: cents(row.amount),
        refund_amount: cents(metadata.refunded_amount),
        status: row.status,
        created_at: row.paid_at ?? row.created_at,
        payment_type: metadata.payment_type ?? row.provider ?? "card",
        appointment_id: metadata.appointment_id ?? null,
      };
    }),
    error: null,
  };
}

/** Pending payments returned in legacy cents for aggregatePayments(). */
export async function fetchPendingPayments(_userId: string) {
  const context = await resolveCurrentWorkspace();
  if (!context) return { data: [], error: null };
  const { data, error } = await productionSupabase.from("payments")
    .select("id,amount,metadata")
    .eq("workspace_id", context.workspaceId)
    .eq("status", "pending");
  if (error) return { data: null, error };
  return {
    data: (data ?? []).map((row) => ({
      id: row.id,
      amount: cents(row.amount),
      appointment_id: object(row.metadata).appointment_id ?? null,
    })),
    error: null,
  };
}

export async function fetchAppointmentStatuses(appointmentIds: string[]) {
  const context = await resolveCurrentWorkspace();
  if (!context || appointmentIds.length === 0) return { data: [], error: null };
  return productionSupabase.from("appointments").select("id,status").eq("workspace_id", context.workspaceId).in("id", appointmentIds);
}

/** Completed job snapshots remain dollars because canonical service financial helpers consume dollars. */
export async function fetchCompletedServices(_userId: string, sinceIso: string) {
  const context = await resolveCurrentWorkspace();
  if (!context) return { data: [], error: null };
  const { data, error } = await productionSupabase.from("service_records")
    .select("id,total_amount,tax_amount,discount_amount,status,completed_at,created_at,updated_at,metadata")
    .eq("workspace_id", context.workspaceId)
    .eq("status", "completed")
    .gte("completed_at", sinceIso)
    .order("completed_at");
  if (error) return { data: null, error };
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
}

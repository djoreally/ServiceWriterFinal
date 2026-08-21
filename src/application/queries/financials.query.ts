/**
 * Financials Query — Abstracts all payment/financial data access for the Financials page.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface FinancialOverviewData {
  // Net collected cash this month (succeeded/refunded payment_records; cents -> dollars)
  totalRevenue: number;
  // Net collected cash in the prior calendar month
  lastMonthRevenue: number;
  totalTransactions: number;
  // Average net collected amount per transaction this month
  avgTicketSize: number;
  // Pending payment_records amount after cancelled-appointment filtering
  outstandingPayments: number;
  totalPending: number;
  // Succeeded net collected / (succeeded net collected + valid pending)
  collectionRate: number;
  // Month buckets of net collected cash
  monthlyRevenue: { month: string; revenue: number }[];
  // Method split of current-month net collected cash
  paymentMethods: { method: string; amount: number; percentage: number }[];
}

/** Get the current authenticated user ID. */
export async function getCurrentUserId(): Promise<string | null> {
  const { data: { user } } = await getCurrentAuthUser();
  return user?.id ?? null;
}

/** Fetch collected payment records (succeeded + refunded) for a user within a date range. */
export async function fetchSucceededPayments(userId: string, sinceIso: string) {
  return supabase
    .from("cash_collection_receipts_v1")
    .select("amount:collected_cents, refund_amount:refunded_cents, status:payment_status, created_at:collected_at, payment_type, appointment_id")
    .eq("user_id", userId)
    .gte("collected_at", sinceIso)
    .order("collected_at");
}

/** Fetch pending payment records for a user. */
export async function fetchPendingPayments(userId: string) {
  return supabase
    .from("payment_records")
    .select("amount, appointment_id")
    .eq("user_id", userId)
    .eq("status", "pending");
}

/** Fetch appointment statuses for given IDs (used to filter cancelled appointments from pending). */
export async function fetchAppointmentStatuses(appointmentIds: string[]) {
  return supabase
    .from("appointments")
    .select("id, status")
    .in("id", appointmentIds);
}


/** Fetch completed services for canonical completed-job financial snapshots. */
export async function fetchCompletedServices(userId: string, sinceIso: string) {
  return supabase
    .from("services")
    .select("total_cost, tax_amount, discount_amount, shop_supplies, paid_amount, payment_status, status, service_date")
    .eq("user_id", userId)
    .eq("status", "completed")
    .gte("service_date", sinceIso)
    .order("service_date");
}

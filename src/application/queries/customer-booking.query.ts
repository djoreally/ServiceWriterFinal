/**
 * Customer Booking Query — Customer-facing booking operations
 *
 * Abstracts customer account, booking fetches, and auth state for the
 * customer portal (MyBookings, CustomerLoginButton, CancelDialog).
 *
 * Auth helpers intentionally keep the browser Supabase auth client
 * (pre-session auth wiring); all data access goes through the API boundary.
 */

import { supabase } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";

// ── Auth helpers ───────────────────────────────────────────────────

export async function getAuthUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function signOut() {
  return supabase.auth.signOut();
}

export function onAuthStateChange(callback: (event: string) => void) {
  return supabase.auth.onAuthStateChange((event) => callback(event));
}

// ── Customer account ───────────────────────────────────────────────

export async function fetchCustomerAccount(userId: string) {
  const { data } = await apiClient.get<{ data: { id: string; email: string; full_name: string | null; phone: string | null } | null }>(
    "/v1/crm/customer-portal/account-row",
    { query: { user_id: userId } },
  );
  return { data, error: null };
}

export async function createCustomerAccountRpc(
  userId: string,
  email: string,
  fullName?: string | null,
  phone?: string | null,
) {
  const { data } = await apiClient.post<{ data: string | null }>("/v1/crm/customer-portal/accounts", {
    email,
    full_name: fullName ?? null,
    phone: phone ?? null,
  });
  return { data, error: null };
}

export interface CustomerAccountRow {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
}

export interface CustomerBookingRow {
  id: string;
  title: string;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  status: string;
  estimated_cost: number | null;
  guest_name: string | null;
  management_token: string | null;
  service_catalog?: {
    name: string;
  } | null;
}

export async function fetchCustomerAccountById(accountId: string) {
  const { data } = await apiClient.get<{ data: CustomerAccountRow | null }>(`/v1/crm/customer-portal/accounts/${accountId}`);
  return { data, error: null };
}

// ── Customer bookings ──────────────────────────────────────────────

export async function fetchCustomerBookings(accountId: string, email: string) {
  const { data } = await apiClient.get<{ data: CustomerBookingRow[] }>("/v1/crm/customer-portal/bookings", {
    query: { ...(accountId ? { account_id: accountId } : {}), email },
  });
  return { data: data ?? [], error: null };
}

// ── Cancel appointment by token ────────────────────────────────────

export async function cancelAppointmentByToken(
  managementToken: string,
  reason?: string,
) {
  const { data } = await apiClient.post<{ data: Record<string, unknown> | null }>(
    "/v1/crm/customer-portal/appointments/cancel-by-token",
    { management_token: managementToken, reason: reason ?? null },
  );
  return { data, error: null };
}

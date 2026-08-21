/**
 * Customer Booking Query — Customer-facing booking operations
 * 
 * Abstracts customer account, booking fetches, and auth state for the
 * customer portal (MyBookings, CustomerLoginButton, CancelDialog).
 */

import { supabase } from "@/integrations/supabase/client";

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
  return supabase
    .from("customer_accounts")
    .select("id, email, full_name, phone")
    .eq("user_id", userId)
    .maybeSingle();
}

export async function createCustomerAccountRpc(
  userId: string,
  email: string,
  fullName?: string | null,
  phone?: string | null,
) {
  return supabase.rpc("create_customer_account", {
    p_user_id: userId,
    p_email: email,
    p_full_name: fullName ?? null,
    p_phone: phone ?? null,
  });
}

export async function fetchCustomerAccountById(accountId: string) {
  return supabase
    .from("customer_accounts")
    .select("*")
    .eq("id", accountId)
    .single();
}

// ── Customer bookings ──────────────────────────────────────────────

export async function fetchCustomerBookings(accountId: string, email: string) {
  const escapedEmail = email.replace(/,/g, "\\,");
  return supabase
    .from("appointments")
    .select(`
      id, title, scheduled_date, scheduled_time, duration_minutes,
      status, estimated_cost, guest_name, management_token,
      service_catalog:service_catalog(name), user_id
    `)
    .or(`customer_account_id.eq.${accountId},guest_email.ilike.${escapedEmail}`)
    .order("scheduled_date", { ascending: false })
    .order("scheduled_time", { ascending: false });
}

// ── Cancel appointment by token ────────────────────────────────────

export async function cancelAppointmentByToken(
  managementToken: string,
  reason?: string,
) {
  return supabase.rpc("cancel_appointment_by_token", {
    p_management_token: managementToken,
    p_cancellation_reason: reason || undefined,
  });
}

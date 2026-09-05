/**
 * Customer Booking Query — canonical customer-portal operations.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const canonicalSupabase = supabase as unknown as SupabaseClient;

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

function displayName(firstName: string | null, lastName: string | null): string | null {
  const value = [firstName, lastName].filter(Boolean).join(" ").trim();
  return value || null;
}

export async function fetchCustomerAccount(_userId: string) {
  const linked = await canonicalSupabase.rpc("link_customer_portal_account_v1");
  if (linked.error) return { data: null, error: linked.error };
  const link = ((linked.data ?? []) as Array<{ customer_id: string; workspace_id: string }>)[0];
  if (!link) return { data: null, error: null };

  const result = await canonicalSupabase
    .from("customers")
    .select("id, workspace_id, email, phone, first_name, last_name")
    .eq("id", link.customer_id)
    .eq("workspace_id", link.workspace_id)
    .maybeSingle();
  if (result.error || !result.data) return { data: null, error: result.error };

  const row = result.data as {
    id: string;
    workspace_id: string;
    email: string | null;
    phone: string | null;
    first_name: string | null;
    last_name: string | null;
  };
  return {
    data: {
      id: row.id,
      email: row.email ?? "",
      full_name: displayName(row.first_name, row.last_name),
      phone: row.phone,
      workspace_id: row.workspace_id,
    },
    error: null,
  };
}

export async function createCustomerAccountRpc(
  _userId: string,
  _email: string,
  _fullName?: string | null,
  _phone?: string | null,
) {
  return canonicalSupabase.rpc("link_customer_portal_account_v1");
}

export async function fetchCustomerAccountById(accountId: string) {
  const { data, error } = await canonicalSupabase
    .from("customers")
    .select("id, workspace_id, email, phone, first_name, last_name")
    .eq("id", accountId)
    .maybeSingle();
  if (error || !data) return { data: null, error };
  const row = data as {
    id: string;
    workspace_id: string;
    email: string | null;
    phone: string | null;
    first_name: string | null;
    last_name: string | null;
  };
  return {
    data: {
      id: row.id,
      email: row.email ?? "",
      full_name: displayName(row.first_name, row.last_name),
      phone: row.phone,
      workspace_id: row.workspace_id,
    },
    error: null,
  };
}

export async function fetchCustomerBookings(_accountId: string, _email: string) {
  const { data, error } = await canonicalSupabase.rpc("get_customer_portal_appointments_v1");
  if (error) return { data: null, error };
  type Row = {
    id: string;
    title: string | null;
    scheduled_date: string;
    scheduled_time: string;
    duration_minutes: number | null;
    status: string;
    estimated_cost: number | null;
    guest_name: string | null;
    management_token: string | null;
    service_catalog_name: string | null;
  };
  return {
    data: ((data ?? []) as Row[]).map((row) => ({
      id: row.id,
      title: row.title ?? "",
      scheduled_date: row.scheduled_date,
      scheduled_time: row.scheduled_time,
      duration_minutes: row.duration_minutes ?? 0,
      status: row.status,
      estimated_cost: row.estimated_cost,
      guest_name: row.guest_name,
      management_token: row.management_token,
      service_catalog: row.service_catalog_name ? { name: row.service_catalog_name } : null,
      user_id: null,
    })),
    error: null,
  };
}

export async function cancelAppointmentByToken(
  managementToken: string,
  reason?: string,
) {
  return supabase.rpc("cancel_appointment_by_token", {
    p_management_token: managementToken,
    p_cancellation_reason: reason || undefined,
  });
}

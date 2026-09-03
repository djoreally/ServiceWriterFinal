/**
 * Customer Appointments Query - Fetch appointments for customer portal.
 *
 * Uses the canonical workspace-scoped RPC. The database links the signed-in
 * Supabase user to matching customers by verified email and prefers the name
 * captured on each appointment over a shared customer-record name.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";

const canonicalSupabase = supabase as unknown as SupabaseClient;

export interface CustomerAppointmentRow {
  id: string;
  title: string;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  status: string;
  estimated_cost: number | null;
  guest_name: string | null;
  management_token: string | null;
  location_address: string | null;
  notes: string | null;
  description: string | null;
  payment_status: string | null;
  service_catalog: { name: string } | null;
  created_at: string | null;
  assigned_at: string | null;
  actual_start_time: string | null;
  actual_end_time: string | null;
}

/** Fetch appointments visible to the current authenticated customer. */
export async function fetchCustomerAppointments(
  _accountId: string,
): Promise<CustomerAppointmentRow[]> {
  const {
    data: { user },
  } = await getCurrentAuthUser();
  if (!user) return [];

  const { data, error } = await canonicalSupabase.rpc("get_customer_portal_appointments_v1");

  if (error) {
    console.error("[fetchCustomerAppointments] rpc error", error);
    throw new Error("Appointments are temporarily unavailable.");
  }

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
    location_address: string | null;
    notes: string | null;
    description: string | null;
    payment_status: string | null;
    service_catalog_name: string | null;
    created_at: string | null;
    assigned_at: string | null;
    actual_start_time: string | null;
    actual_end_time: string | null;
  };

  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    title: r.title ?? "",
    scheduled_date: r.scheduled_date,
    scheduled_time: r.scheduled_time,
    duration_minutes: r.duration_minutes ?? 0,
    status: r.status,
    estimated_cost: r.estimated_cost,
    guest_name: r.guest_name,
    management_token: r.management_token,
    location_address: r.location_address,
    notes: r.notes,
    description: r.description,
    payment_status: r.payment_status,
    service_catalog: r.service_catalog_name ? { name: r.service_catalog_name } : null,
    created_at: r.created_at,
    assigned_at: r.assigned_at,
    actual_start_time: r.actual_start_time,
    actual_end_time: r.actual_end_time,
  }));
}

/**
 * Customer Appointments Query - Fetch appointments for customer portal.
 *
 * Uses the get_customer_portal_appointments RPC, which resolves every linkage
 * path for the signed-in customer (account id, customer record id by account
 * link or matching email, and guest_email case-insensitively). This avoids
 * PostgREST `.or()` quirks with dots/@ in emails and guarantees that any
 * appointment ever booked under this customer's email shows up in the portal.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
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

/** Fetch appointments for a customer account. */
export async function fetchCustomerAppointments(
  _accountId: string,
): Promise<CustomerAppointmentRow[]> {
  const {
    data: { user },
  } = await getCurrentAuthUser();
  if (!user) return [];

  const { data, error } = await supabase.rpc("get_customer_portal_appointments");

  if (error) {
    console.error("[fetchCustomerAppointments] rpc error", error);
    return [];
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
    service_catalog: r.service_catalog_name
      ? { name: r.service_catalog_name }
      : null,
    created_at: r.created_at,
    assigned_at: r.assigned_at,
    actual_start_time: r.actual_start_time,
    actual_end_time: r.actual_end_time,
  }));
}

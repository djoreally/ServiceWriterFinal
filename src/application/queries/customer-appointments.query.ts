/**
 * Customer Appointments Query - Fetch appointments for customer portal.
 *
 * Uses the canonical workspace-scoped RPC. The database links the signed-in
 * Supabase user to matching customers by verified email and prefers the name
 * captured on each appointment over a shared customer-record name.
 */
import { apiClient } from "@/lib/api-client";
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

/** Fetch appointments visible to the current authenticated customer. */
export async function fetchCustomerAppointments(
  _accountId: string,
): Promise<CustomerAppointmentRow[]> {
  const {
    data: { user },
  } = await getCurrentAuthUser();
  if (!user) return [];

  const { data } = await apiClient.get<{ data: CustomerAppointmentRow[] }>("/v1/crm/customer-portal/appointments");
  return data ?? [];
}

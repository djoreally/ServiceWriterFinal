/**
 * Customer Portal Queries — Read operations for customer-facing service history and payments.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface CustomerServiceRecord {
  id: string;
  title: string;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
  estimated_cost: number | null;
  duration_minutes: number;
  description: string | null;
  notes: string | null;
  tax_amount: number | null;
  actual_start_time: string | null;
  actual_end_time: string | null;
  service_catalog: { name: string } | null;
  vehicles: { make: string; model: string; year: number } | null;
}

export interface CustomerPaymentRecord {
  id: string;
  title: string;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
  estimated_cost: number | null;
  payment_status: string | null;
  tax_amount: number | null;
  service_catalog: { name: string } | null;
}

/**
 * Fetch service history for a customer account.
 */
export async function fetchCustomerServiceHistory(accountId: string): Promise<CustomerServiceRecord[]> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return [];
  const escapedEmail = (user.email || "").replace(/,/g, "\\,");

  const { data, error } = await supabase
    .from("appointments")
    .select(`
      id, title, scheduled_date, scheduled_time, status,
      estimated_cost, duration_minutes, description, notes,
      tax_amount, actual_start_time, actual_end_time,
      service_catalog:service_catalog(name),
      vehicles:vehicle_id(make, model, year)
    `)
    .or(`customer_account_id.eq.${accountId},guest_email.ilike.${escapedEmail}`)
    .in("status", ["completed", "in_progress"])
    .order("scheduled_date", { ascending: false });

  if (error) throw error;
  return (data as CustomerServiceRecord[]) || [];
}

/**
 * Fetch payment history for a customer account.
 */
export async function fetchCustomerPaymentHistory(accountId: string): Promise<CustomerPaymentRecord[]> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return [];
  const escapedEmail = (user.email || "").replace(/,/g, "\\,");

  const { data, error } = await supabase
    .from("appointments")
    .select(`
      id, title, scheduled_date, scheduled_time, status,
      estimated_cost, payment_status, tax_amount,
      service_catalog:service_catalog(name)
    `)
    .or(`customer_account_id.eq.${accountId},guest_email.ilike.${escapedEmail}`)
    .not("payment_status", "is", null)
    .order("scheduled_date", { ascending: false });

  if (error) throw error;
  return (data as CustomerPaymentRecord[]) || [];
}

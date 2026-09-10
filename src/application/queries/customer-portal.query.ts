/** Customer Portal Queries — canonical customer-facing service history and payments. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";

const canonicalSupabase = supabase as unknown as SupabaseClient;

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
  invoice_id: string | null;
  invoice_number: number | null;
  invoice_status: string | null;
  payment_url: string | null;
  receipt_url: string | null;
}

export async function fetchCustomerServiceHistory(_accountId: string): Promise<CustomerServiceRecord[]> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return [];
  const { data, error } = await canonicalSupabase.rpc("get_customer_portal_service_history_v1");
  if (error) throw error;
  type Row = { id:string; title:string|null; scheduled_date:string; scheduled_time:string; status:string; estimated_cost:number|null; duration_minutes:number|null; description:string|null; notes:string|null; tax_amount:number|null; actual_start_time:string|null; actual_end_time:string|null; service_catalog_name:string|null; vehicle_make:string|null; vehicle_model:string|null; vehicle_year:number|null };
  return ((data ?? []) as Row[]).map((row) => ({
    id: row.id, title: row.title ?? "Service", scheduled_date: row.scheduled_date, scheduled_time: row.scheduled_time, status: row.status,
    estimated_cost: row.estimated_cost, duration_minutes: row.duration_minutes ?? 0, description: row.description, notes: row.notes, tax_amount: row.tax_amount,
    actual_start_time: row.actual_start_time, actual_end_time: row.actual_end_time,
    service_catalog: row.service_catalog_name ? { name: row.service_catalog_name } : null,
    vehicles: row.vehicle_make || row.vehicle_model || row.vehicle_year != null ? { make: row.vehicle_make ?? "", model: row.vehicle_model ?? "", year: row.vehicle_year ?? 0 } : null,
  }));
}

export async function fetchCustomerPaymentHistory(_accountId: string): Promise<CustomerPaymentRecord[]> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return [];
  const { data, error } = await canonicalSupabase.rpc("get_customer_portal_payments_v1");
  if (error) throw error;
  type Row = { id:string; title:string|null; scheduled_date:string; scheduled_time:string; status:string; estimated_cost:number|null; payment_status:string|null; tax_amount:number|null; service_catalog_name:string|null; invoice_id:string|null; invoice_number:number|null; invoice_status:string|null; payment_url:string|null; receipt_url:string|null };
  return ((data ?? []) as Row[]).map((row) => ({
    id: row.id, title: row.title ?? "Payment", scheduled_date: row.scheduled_date, scheduled_time: row.scheduled_time, status: row.status,
    estimated_cost: row.estimated_cost, payment_status: row.payment_status, tax_amount: row.tax_amount,
    service_catalog: row.service_catalog_name ? { name: row.service_catalog_name } : null,
    invoice_id: row.invoice_id, invoice_number: row.invoice_number, invoice_status: row.invoice_status, payment_url: row.payment_url, receipt_url: row.receipt_url,
  }));
}

/** Customer Portal Queries — canonical customer-facing service history and payments. */
import { apiClient } from "@/lib/api-client";
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
  invoice_id: string | null;
  invoice_number: number | null;
  invoice_status: string | null;
  payment_url: string | null;
  receipt_url: string | null;
}

export async function fetchCustomerServiceHistory(_accountId: string): Promise<CustomerServiceRecord[]> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return [];
  const { data } = await apiClient.get<{ data: CustomerServiceRecord[] }>("/v1/crm/customer-portal/service-history");
  return data ?? [];
}

export async function fetchCustomerPaymentHistory(_accountId: string): Promise<CustomerPaymentRecord[]> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return [];
  const { data } = await apiClient.get<{ data: CustomerPaymentRecord[] }>("/v1/crm/customer-portal/payments");
  return data ?? [];
}

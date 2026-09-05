/** Customer Portal Queries — canonical customer appointment RPC. */
import { fetchCustomerAppointments } from "@/application/queries/customer-appointments.query";

export interface CustomerServiceRecord {
  id: string; title: string; scheduled_date: string; scheduled_time: string; status: string;
  estimated_cost: number | null; duration_minutes: number; description: string | null; notes: string | null;
  tax_amount: number | null; actual_start_time: string | null; actual_end_time: string | null;
  service_catalog: { name: string } | null; vehicles: { make: string; model: string; year: number } | null;
}
export interface CustomerPaymentRecord {
  id: string; title: string; scheduled_date: string; scheduled_time: string; status: string;
  estimated_cost: number | null; payment_status: string | null; tax_amount: number | null;
  service_catalog: { name: string } | null;
}

export async function fetchCustomerServiceHistory(accountId: string): Promise<CustomerServiceRecord[]> {
  const appointments = await fetchCustomerAppointments(accountId);
  return appointments
    .filter((row) => row.status === "completed" || row.status === "in_progress")
    .map((row) => ({
      id: row.id, title: row.title, scheduled_date: row.scheduled_date, scheduled_time: row.scheduled_time,
      status: row.status, estimated_cost: row.estimated_cost, duration_minutes: row.duration_minutes,
      description: row.description, notes: row.notes, tax_amount: null,
      actual_start_time: row.actual_start_time, actual_end_time: row.actual_end_time,
      service_catalog: row.service_catalog, vehicles: null,
    }));
}

export async function fetchCustomerPaymentHistory(accountId: string): Promise<CustomerPaymentRecord[]> {
  const appointments = await fetchCustomerAppointments(accountId);
  return appointments
    .filter((row) => row.payment_status != null)
    .map((row) => ({
      id: row.id, title: row.title, scheduled_date: row.scheduled_date, scheduled_time: row.scheduled_time,
      status: row.status, estimated_cost: row.estimated_cost, payment_status: row.payment_status,
      tax_amount: null, service_catalog: row.service_catalog,
    }));
}

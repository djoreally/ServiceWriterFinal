/** Fleet invoice documents and authoritative accounts-receivable state. */
import { apiClient } from "@/lib/api-client";

export interface FleetInvoiceRow {
  id: string;
  invoice_number: string;
  fleet_client_id: string;
  status: string;
  issue_date: string;
  due_date: string | null;
  total: number;
  amount_paid: number;
  sent_at: string | null;
  delivery_status: string;
  delivery_last_error: string | null;
  delivery_attempt_count: number;
  created_at: string;
  fleet_clients: { company_name: string } | null;
}

export async function fetchFleetInvoices(userId: string, clientId?: string): Promise<FleetInvoiceRow[]> {
  const params = new URLSearchParams();
  if (clientId) params.set("client_id", clientId);
  const query = params.toString() ? `?${params.toString()}` : "";
  const { data } = await apiClient.get<{ data: FleetInvoiceRow[] }>(`/v1/fleet/invoices${query}`);
  return (data ?? []) as FleetInvoiceRow[];
}

/** Fleet invoice documents and authoritative accounts-receivable state. */
import { supabase } from "@/integrations/supabase/client";

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
  let query = supabase
    .from("invoices")
    .select(
      "id, invoice_number, fleet_client_id, status, issue_date, due_date, total, amount_paid, sent_at, delivery_status, delivery_last_error, delivery_attempt_count, created_at, fleet_clients(company_name)",
    )
    .eq("user_id", userId)
    .eq("bill_to_type", "fleet");

  if (clientId) query = query.eq("fleet_client_id", clientId);
  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as FleetInvoiceRow[];
}

import { supabase } from "@/integrations/supabase/client";
import type { Dollars } from "@/lib/money";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export type DispatcherFleetWorkOrder = {
  id: string;
  order_number: string | null;
  status: string;
  total: Dollars | null;
  scheduled_date: string | null;
  completed_at: string | null;
  po_number: string | null;
  fleet_client_id: string;
  fleet_contract_id: string | null;
  fleet_clients: {
    company_name: string;
    payment_terms: string | null;
    tax_exempt: boolean | null;
    billing_email: string | null;
    ap_contact_email: string | null;
  } | null;
  fleet_contracts: {
    name: string;
    invoice_frequency: string | null;
    pricing_rules: Record<string, unknown> | null;
  } | null;
  fleet_vehicles: { year: number; make: string; model: string; unit_number: string | null; mileage: number | null } | null;
};

export async function fetchDispatcherFleetWorkOrders(): Promise<DispatcherFleetWorkOrder[]> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("fleet_work_orders")
    .select("id, order_number, status, total, scheduled_date, completed_at, po_number, fleet_client_id, fleet_contract_id, fleet_clients(company_name, payment_terms, tax_exempt, billing_email, ap_contact_email), fleet_contracts(name, invoice_frequency, pricing_rules), fleet_vehicles(year, make, model, unit_number, mileage)")
    .eq("user_id", user.id)
    .in("status", ["scheduled", "assigned", "en_route", "arrived", "in_progress", "completed"])
    .order("scheduled_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as DispatcherFleetWorkOrder[];
}

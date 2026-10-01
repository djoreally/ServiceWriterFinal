/**
 * Dispatcher work-orders query — reads through the typed API client
 * (`@/lib/api-client`) to the fleet Hono router. Direct browser-Supabase
 * data access was removed; auth/RLS stay server-enforced. Exported
 * signatures are unchanged.
 */
import { apiClient } from "@/lib/api-client";
import type { Dollars } from "@/lib/money";

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
  const response = await apiClient.get<{ data: DispatcherFleetWorkOrder[] | null }>(
    "/v1/fleet/dispatch/work-orders",
  );
  return response.data ?? [];
}

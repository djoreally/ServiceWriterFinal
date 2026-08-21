/**
 * Fleet Contracts Query - Read operations for contracts page.
 */

import { supabase } from "@/integrations/supabase/client";

export interface FleetContract {
  id: string;
  name: string;
  is_active: boolean;
  sla_hours: number | null;
  approval_threshold: number | null;
  invoice_frequency: string | null;
  start_date: string | null;
  end_date: string | null;
  pricing_rules: any[] | null;
  fleet_clients: { company_name: string } | null;
}

export async function fetchFleetContracts(userId: string): Promise<FleetContract[]> {
  const { data } = await supabase
    .from("fleet_contracts")
    .select("*, fleet_clients(company_name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return (data ?? []) as FleetContract[];
}

/**
 * Fleet Contract Services Query — fetch services attached to a fleet contract.
 */
import { supabase } from "@/integrations/supabase/client";

export interface FleetContractServiceRow {
  id: string;
  fleet_contract_id: string;
  service_catalog_id: string;
  custom_price: number | null;
  custom_label: string | null;
  pricing_model: string;
  is_active: boolean;
  notes: string | null;
  billing_frequency: string | null;
  sort_order: number;
  service_catalog?: {
    id: string;
    name: string;
    description: string | null;
    category: string | null;
    default_price: number;
    estimated_duration: number | null;
  } | null;
}

/** Fetch all services attached to a fleet contract, with canonical catalog data. */
export async function fetchFleetContractServices(
  contractId: string,
): Promise<FleetContractServiceRow[]> {
  const { data, error } = await supabase
    .from("fleet_contract_services")
    .select(
      "*, service_catalog(id, name, description, category, default_price, estimated_duration)",
    )
    .eq("fleet_contract_id", contractId)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []) as FleetContractServiceRow[];
}

/** Fetch active services for a fleet client's active contract (for work order creation). */
export async function fetchContractServicesForClient(
  clientId: string,
  userId: string,
): Promise<FleetContractServiceRow[]> {
  // Find the active contract for this client
  const { data: contracts } = await supabase
    .from("fleet_contracts")
    .select("id")
    .eq("fleet_client_id", clientId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1);

  if (!contracts?.length) return [];

  const { data, error } = await supabase
    .from("fleet_contract_services")
    .select(
      "*, service_catalog(id, name, description, category, default_price, estimated_duration)",
    )
    .eq("fleet_contract_id", contracts[0].id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []) as FleetContractServiceRow[];
}

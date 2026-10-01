/**
 * Fleet Contract Services Query — fetch services attached to a fleet contract.
 */
import { apiClient } from "@/lib/api-client";

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
  const { data } = await apiClient.get<{ data: FleetContractServiceRow[] }>(
    `/v1/fleet/contract-services?contract_id=${encodeURIComponent(contractId)}`,
  );
  return (data ?? []) as FleetContractServiceRow[];
}

/** Fetch active services for a fleet client's active contract (for work order creation). */
export async function fetchContractServicesForClient(
  clientId: string,
  userId: string,
): Promise<FleetContractServiceRow[]> {
  const { data } = await apiClient.get<{ data: FleetContractServiceRow[] }>(
    `/v1/fleet/contract-services/for-client?client_id=${encodeURIComponent(clientId)}`,
  );
  return (data ?? []) as FleetContractServiceRow[];
}

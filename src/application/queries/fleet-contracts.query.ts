/**
 * Fleet Contracts Query - Read operations for contracts page.
 */

import { apiClient } from "@/lib/api-client";

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
  const { data } = await apiClient.get<{ data: FleetContract[] }>("/v1/fleet/contracts");
  return (data ?? []) as FleetContract[];
}

/**
 * Fetch active fleet contracts with their pricing rules for automated billing.
 * Contracts are read under the workspace owner (billing root) account.
 */
export async function fetchFleetContractsForBilling(workspaceId: string | null) {
  if (!workspaceId) return [];
  const { data } = await apiClient.get<{ data: any[] }>(
    `/v1/fleet/contracts/billing?selected_workspace_id=${encodeURIComponent(workspaceId)}`,
  );
  return data ?? [];
}

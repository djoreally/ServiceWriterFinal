/** Fleet reporting over the canonical workspace-scoped Fleet OS schema. */
import { apiClient } from "@/lib/api-client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface FleetReportStats {
  totalSpend: number;
  vehicleCount: number;
  locationCount: number;
  avgCostPerVehicle: number;
  openApprovals: number;
  overdueVehicles: number;
  poOpenCount: number;
  invoicesPending: number;
}

export interface FleetTopVehicleSpendItem {
  total: number;
  vehicle: { year: number; make: string; model: string; unit_number: string | null } | null;
}

export interface FleetReportPageData {
  stats: FleetReportStats;
  topVehicles: FleetTopVehicleSpendItem[];
}

const EMPTY: FleetReportPageData = {
  stats: {
    totalSpend: 0,
    vehicleCount: 0,
    locationCount: 0,
    avgCostPerVehicle: 0,
    openApprovals: 0,
    overdueVehicles: 0,
    poOpenCount: 0,
    invoicesPending: 0,
  },
  topVehicles: [],
};

/**
 * Fleet monetary reporting is intentionally conservative here. Production no
 * longer has the legacy fleet_work_orders / fleet_purchase_orders tables that
 * previously supplied spend and PO totals, so those values remain zero rather
 * than inventing financial truth. Operational fleet counts come from the
 * canonical workspace-scoped service-request domain.
 */
export async function fetchFleetReportPageData(_userId: string): Promise<FleetReportPageData> {
  const context = await resolveCurrentWorkspace();
  if (!context) return EMPTY;

  const { data } = await apiClient.get<{ data: FleetReportPageData }>(
    `/v1/fleet/reports?selected_workspace_id=${encodeURIComponent(context.workspaceId)}`,
  );
  return data ?? EMPTY;
}

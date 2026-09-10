/** Fleet reporting over the canonical workspace-scoped Fleet OS schema. */
import { supabase } from "@/integrations/supabase/client";
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

type FleetRequestRow = {
  vehicle_id: string | null;
  location_id: string | null;
  status: string | null;
  requested_for: string | null;
};

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

  const { data, error } = await supabase
    .from("fleet_service_requests")
    .select("vehicle_id,location_id,status,requested_for")
    .eq("workspace_id", context.workspaceId);
  if (error) throw error;

  const requests = (data ?? []) as FleetRequestRow[];
  const vehicleIds = new Set(requests.map((row) => row.vehicle_id).filter((id): id is string => Boolean(id)));
  const locationIds = new Set(requests.map((row) => row.location_id).filter((id): id is string => Boolean(id)));
  const terminal = new Set(["completed", "cancelled", "closed", "voided"]);
  const now = Date.now();
  const open = requests.filter((row) => !terminal.has(String(row.status ?? "").toLowerCase()));
  const overdue = open.filter((row) => row.requested_for && Date.parse(row.requested_for) < now).length;

  return {
    stats: {
      ...EMPTY.stats,
      vehicleCount: vehicleIds.size,
      locationCount: locationIds.size,
      openApprovals: open.length,
      overdueVehicles: overdue,
    },
    topVehicles: [],
  };
}

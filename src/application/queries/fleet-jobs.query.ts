import { apiClient } from "@/lib/api-client";
import type { Database } from "@/integrations/supabase/types";
import type { FleetWorkOrderSummary } from "./fleet.query";

export type FleetJobRow = Database["public"]["Tables"]["fleet_jobs"]["Row"];

export interface FleetJobDetail extends FleetJobRow {
  fleet_clients?: { id: string; company_name: string | null } | null;
  fleet_locations?: {
    id: string;
    name: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
  } | null;
  technicians?: { id: string; name: string | null } | null;
  work_orders: FleetWorkOrderSummary[];
}

/** Fetch a single fleet job with its child work orders (one stop, N vehicles). */
export async function fetchFleetJobDetail(jobId: string): Promise<FleetJobDetail | null> {
  const { data } = await apiClient.get<{ data: FleetJobDetail | null }>(`/v1/fleet/jobs/${jobId}`);
  return data ?? null;
}

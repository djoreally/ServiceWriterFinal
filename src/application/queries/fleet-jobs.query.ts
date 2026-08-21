import { supabase } from "@/integrations/supabase/client";
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

const WORK_ORDER_SELECT =
  "*, fleet_vehicles(year, make, model, unit_number), fleet_clients(company_name), fleet_locations(name, address, city, state), fleet_jobs(id, job_number)";

/** Fetch a single fleet job with its child work orders (one stop, N vehicles). */
export async function fetchFleetJobDetail(jobId: string): Promise<FleetJobDetail | null> {
  const { data, error } = await supabase
    .from("fleet_jobs")
    .select("*, fleet_clients(id, company_name), fleet_locations(id, name, address, city, state), technicians(id, name)")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { data: orders, error: ordersError } = await supabase
    .from("fleet_work_orders")
    .select(WORK_ORDER_SELECT)
    .eq("fleet_job_id", jobId)
    .order("created_at", { ascending: true });
  if (ordersError) throw ordersError;

  return {
    ...(data as Omit<FleetJobDetail, "work_orders">),
    work_orders: (orders ?? []) as FleetWorkOrderSummary[],
  };
}

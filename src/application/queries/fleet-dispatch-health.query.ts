import { supabase } from "@/integrations/supabase/client";
export interface FleetDispatchHealth {
  open_requests: number; unclaimed_requests: number; sla_risk: number; p95_first_response_minutes: number;
  conversion_rate: number; pending_deliveries: number; dead_letters: number; days_without_capacity: number;
}
export async function fetchFleetDispatchHealth(): Promise<FleetDispatchHealth> {
  const { data, error } = await (supabase as any).rpc("get_fleet_dispatch_health_v1");
  if (error) throw error;
  return data as FleetDispatchHealth;
}

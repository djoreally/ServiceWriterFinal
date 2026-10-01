import { apiClient } from "@/lib/api-client";
export interface FleetDispatchHealth {
  open_requests: number; unclaimed_requests: number; sla_risk: number; p95_first_response_minutes: number;
  conversion_rate: number; pending_deliveries: number; dead_letters: number; days_without_capacity: number;
}
export async function fetchFleetDispatchHealth(): Promise<FleetDispatchHealth> {
  const { data } = await apiClient.get<{ data: FleetDispatchHealth }>("/v1/fleet/dispatch-health");
  return data as FleetDispatchHealth;
}

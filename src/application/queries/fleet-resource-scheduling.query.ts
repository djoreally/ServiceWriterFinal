import { apiClient } from "@/lib/api-client";
export interface FleetResourceCapacity {
  technician_id: string;
  technician_name: string;
  available_start: string;
  available_end: string;
  available_minutes: number;
  scheduled_minutes: number;
  remaining_minutes: number;
  jobs_scheduled: number;
  max_jobs: number;
  is_blacked_out: boolean;
}

export async function fetchFleetResourceCapacity(date: string): Promise<FleetResourceCapacity[]> {
  const { data } = await apiClient.get<{ data: FleetResourceCapacity[] }>(
    `/v1/fleet/resource-capacity?date=${encodeURIComponent(date)}`,
  );
  return data ?? [];
}

export async function assignFleetWorkOrderSlot(_input: {
  workOrderId: string; technicianId: string; date: string; start: string; durationMinutes: number; expectedUpdatedAt: string;
}): Promise<void> {
  throw new Error("Fleet dispatch is separated from Service Writer. Use the Fleet application for Fleet assignments.");
}

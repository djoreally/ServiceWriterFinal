/**
 * Vehicle Recommendations Queries & Commands
 * Handles maintenance recommendation CRUD and auto-generation from service history.
 */

import { apiClient } from "@/lib/api-client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface Recommendation {
  id: string;
  vehicle_id: string;
  recommendation_type: string;
  title: string;
  description: string | null;
  priority: "high" | "medium" | "low";
  due_mileage: number | null;
  due_date: string | null;
  is_dismissed: boolean;
  last_service_mileage: number | null;
  last_service_date: string | null;
  interval_miles: number | null;
  interval_months: number | null;
}

export interface MaintenanceInterval {
  id: string;
  service_type: string;
  title: string;
  description: string | null;
  default_interval_miles: number | null;
  default_interval_months: number | null;
  priority: "high" | "medium" | "low";
}

export async function fetchVehicleRecommendations(vehicleId: string): Promise<Recommendation[]> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return [];

  const { data } = await apiClient.get<{ data: Recommendation[] }>("/v1/vehicle-recommendations", {
    query: { vehicle_id: vehicleId },
  });

  return ((data ?? []) as Recommendation[]).sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return (order[a.priority] ?? 2) - (order[b.priority] ?? 2);
  });
}

export async function fetchMaintenanceIntervals(): Promise<MaintenanceInterval[]> {
  const { data } = await apiClient.get<{ data: MaintenanceInterval[] }>("/v1/maintenance-intervals");
  return (data || []) as MaintenanceInterval[];
}

export async function dismissRecommendation(id: string): Promise<void> {
  try {
    await apiClient.patch(`/v1/vehicle-recommendations/${id}/dismiss`);
  } catch {
    throw new Error("Failed to dismiss");
  }
}

export async function deleteRecommendation(id: string): Promise<void> {
  try {
    await apiClient.delete(`/v1/vehicle-recommendations/${id}`);
  } catch {
    throw new Error("Failed to mark complete");
  }
}

export async function addRecommendation(rec: {
  vehicle_id: string;
  recommendation_type: string;
  title: string;
  description?: string | null;
  priority: string;
  due_mileage?: number | null;
  due_date?: string | null;
  interval_miles?: number | null;
  interval_months?: number | null;
}): Promise<void> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");

  try {
    await apiClient.post("/v1/vehicle-recommendations", { rec });
  } catch {
    throw new Error("Failed to add recommendation");
  }
}

/**
 * Generate recommendations by analyzing service history against maintenance intervals.
 */
export async function generateRecommendationsFromHistory(
  vehicleId: string,
  currentMileage: number | null,
  intervals: MaintenanceInterval[]
): Promise<number> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return 0;

  try {
    const { data } = await apiClient.post<{ data: { count: number } }>(
      "/v1/vehicle-recommendations/generate",
      { vehicle_id: vehicleId, current_mileage: currentMileage, intervals },
    );
    return data?.count ?? 0;
  } catch {
    throw new Error("Failed to generate recommendations");
  }
}

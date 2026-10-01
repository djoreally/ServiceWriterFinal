/**
 * Admin Platform Stats Query
 * Abstracts the get_platform_stats RPC call.
 */
import { apiClient } from "@/lib/api-client";

export interface PlatformStats {
  totalUsers: number;
  totalVehicles: number;
  totalServices: number;
  totalAppointments: number;
  totalRevenue: number;
  activeShops: number;
}

export async function fetchPlatformStats(): Promise<PlatformStats> {
  const data = await apiClient.get<PlatformStats>("/v1/platform/stats");
  return {
    totalUsers: Number(data?.totalUsers ?? 0),
    totalVehicles: Number(data?.totalVehicles ?? 0),
    totalServices: Number(data?.totalServices ?? 0),
    totalAppointments: Number(data?.totalAppointments ?? 0),
    totalRevenue: Number(data?.totalRevenue ?? 0),
    activeShops: Number(data?.activeShops ?? 0),
  };
}

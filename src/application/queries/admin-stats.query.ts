/**
 * Admin Platform Stats Query
 * Abstracts the get_platform_stats RPC call.
 */
import { supabase } from "@/integrations/supabase/client";

export interface PlatformStats {
  totalUsers: number;
  totalVehicles: number;
  totalServices: number;
  totalAppointments: number;
  totalRevenue: number;
  activeShops: number;
}

export async function fetchPlatformStats(): Promise<PlatformStats> {
  const { data, error } = await supabase.rpc("get_platform_stats");

  if (error) throw error;

  const statsData = data as Partial<{
    usersCount: number;
    vehiclesCount: number;
    servicesCount: number;
    appointmentsCount: number;
    totalRevenue: number;
    shopsCount: number;
  }> | null;

  return {
    totalUsers: Number(statsData?.usersCount ?? 0),
    totalVehicles: Number(statsData?.vehiclesCount ?? 0),
    totalServices: Number(statsData?.servicesCount ?? 0),
    totalAppointments: Number(statsData?.appointmentsCount ?? 0),
    totalRevenue: Number(statsData?.totalRevenue ?? 0),
    activeShops: Number(statsData?.shopsCount ?? 0),
  };
}

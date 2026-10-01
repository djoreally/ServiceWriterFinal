/**
 * Admin CARFAX Settings Query — Read operations for platform-level CARFAX config.
 */
import { apiClient } from "@/lib/api-client";

export interface CarfaxConfig {
  enabled: boolean;
  location_id: string;
  api_configured: boolean;
  business_name?: string;
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  phone?: string;
  website_url?: string;
}

export interface CarfaxExportStats {
  total: number;
  lastExport: string | null;
}

export async function fetchAdminCarfaxSettings(): Promise<CarfaxConfig | null> {
  const { data } = await apiClient.get<{ data: CarfaxConfig | null }>("/v1/admin/carfax/settings");
  return data ?? null;
}

export async function fetchCarfaxExportStats(): Promise<CarfaxExportStats> {
  const { data } = await apiClient.get<{ data: CarfaxExportStats }>("/v1/admin/carfax/export-stats");
  return data ?? { total: 0, lastExport: null };
}

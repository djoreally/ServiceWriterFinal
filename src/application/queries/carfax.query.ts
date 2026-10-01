/** CARFAX Query — canonical workspace settings and service-history stats. */
import { apiClient } from "@/lib/api-client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface CarfaxSettingsData {
  carfax_location_id: string;
  city: string;
  state: string;
  postal_code: string;
  website_url: string;
  business_name: string;
  address: string;
  phone: string;
  carfax_activated?: boolean;
  carfax_activation_date?: string | null;
}

export interface CarfaxExportRecord {
  id: string; export_type: string; file_name: string; record_count: number;
  export_date: string; status: string; created_at: string;
}
export interface CarfaxDataStats { totalServices: number; validVins: number; missingData: number; }

export async function fetchCarfaxSettings(): Promise<CarfaxSettingsData | null> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return null;
  const context = await resolveCurrentWorkspace();
  if (!context) return null;
  const { data } = await apiClient.get<{ data: CarfaxSettingsData | null }>("/v1/carfax/settings", {
    query: { selected_workspace_id: context.workspaceId },
  });
  return data ?? null;
}

/** Final does not persist a CARFAX export-log table yet. */
export async function fetchCarfaxExports(): Promise<CarfaxExportRecord[]> {
  return [];
}

export async function fetchCarfaxDataStats(): Promise<CarfaxDataStats> {
  const context = await resolveCurrentWorkspace();
  if (!context) return { totalServices: 0, validVins: 0, missingData: 0 };
  const { data } = await apiClient.get<{ data: CarfaxDataStats }>("/v1/carfax/data-stats", {
    query: { selected_workspace_id: context.workspaceId },
  });
  return data ?? { totalServices: 0, validVins: 0, missingData: 0 };
}

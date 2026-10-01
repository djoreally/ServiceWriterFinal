/**
 * CARFAX Exports Query - Read operations for export history and monitoring.
 */

import { apiClient } from "@/lib/api-client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface CarfaxExportRecord {
  id: string;
  export_type: "PROD" | "HIST";
  file_name: string;
  record_count: number;
  status: "pending" | "completed" | "failed" | "uploaded";
  error_message?: string;
  created_at: string;
  updated_at: string;
  uploaded_at?: string;
}

export interface CarfaxExportStats {
  totalExports: number;
  successfulExports: number;
  failedExports: number;
  totalRecordsExported: number;
  lastExportDate?: string;
  lastExportStatus?: string;
}

/**
 * Fetch export history for the current user's shop
 */
export async function fetchCarfaxExportHistory(limit: number = 20): Promise<CarfaxExportRecord[]> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return [];

  try {
    const { data } = await apiClient.get<{ data: CarfaxExportRecord[] }>("/v1/carfax/exports/history", {
      query: { limit },
    });
    return data ?? [];
  } catch (error) {
    console.error("Error fetching export history:", error);
    return [];
  }
}

/**
 * Fetch statistics about CARFAX exports
 */
export async function fetchCarfaxExportStats(): Promise<CarfaxExportStats> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) {
    return {
      totalExports: 0,
      successfulExports: 0,
      failedExports: 0,
      totalRecordsExported: 0,
    };
  }

  try {
    const { data } = await apiClient.get<{ data: CarfaxExportRecord[] }>("/v1/carfax/exports/stats");
    const exports = (data ?? []) as CarfaxExportRecord[];
    const successfulExports = exports.filter(e => e.status === "completed" || e.status === "uploaded");
    const failedExports = exports.filter(e => e.status === "failed");
    const totalRecords = exports.reduce((sum, e) => sum + (e.record_count || 0), 0);
    const lastExport = exports[0];

    return {
      totalExports: exports.length,
      successfulExports: successfulExports.length,
      failedExports: failedExports.length,
      totalRecordsExported: totalRecords,
      lastExportDate: lastExport?.created_at,
      lastExportStatus: lastExport?.status,
    };
  } catch (error) {
    console.error("Error fetching export stats:", error);
    return {
      totalExports: 0,
      successfulExports: 0,
      failedExports: 0,
      totalRecordsExported: 0,
    };
  }
}

/**
 * Fetch today's PROD exports for the current user
 */
export async function fetchTodaysExports(): Promise<CarfaxExportRecord[]> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return [];

  try {
    const { data } = await apiClient.get<{ data: CarfaxExportRecord[] }>("/v1/carfax/exports/today");
    return data ?? [];
  } catch (error) {
    console.error("Error fetching today's exports:", error);
    return [];
  }
}

/**
 * Fetch the latest export for the current user
 */
export async function fetchLatestExport(): Promise<CarfaxExportRecord | null> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return null;

  try {
    const { data } = await apiClient.get<{ data: CarfaxExportRecord | null }>("/v1/carfax/exports/latest");
    return data ?? null;
  } catch (error) {
    console.error("Error fetching latest export:", error);
    return null;
  }
}

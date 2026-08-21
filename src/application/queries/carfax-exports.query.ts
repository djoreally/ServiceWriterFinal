/**
 * CARFAX Exports Query - Read operations for export history and monitoring.
 */

import { supabase } from "@/integrations/supabase/client";

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

  const { data, error } = await supabase
    .from("carfax_exports")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching export history:", error);
    return [];
  }

  return (data ?? []) as CarfaxExportRecord[];
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

  const { data, error } = await supabase
    .from("carfax_exports")
    .select("*")
    .eq("user_id", user.id);

  if (error) {
    console.error("Error fetching export stats:", error);
    return {
      totalExports: 0,
      successfulExports: 0,
      failedExports: 0,
      totalRecordsExported: 0,
    };
  }

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
}

/**
 * Fetch today's PROD exports for the current user
 */
export async function fetchTodaysExports(): Promise<CarfaxExportRecord[]> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return [];

  const today = new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("carfax_exports")
    .select("*")
    .eq("user_id", user.id)
    .eq("export_type", "PROD")
    .gte("created_at", `${today}T00:00:00`)
    .lte("created_at", `${today}T23:59:59`)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching today's exports:", error);
    return [];
  }

  return (data ?? []) as CarfaxExportRecord[];
}

/**
 * Fetch the latest export for the current user
 */
export async function fetchLatestExport(): Promise<CarfaxExportRecord | null> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("carfax_exports")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error fetching latest export:", error);
    return null;
  }

  return (data ?? null) as CarfaxExportRecord | null;
}

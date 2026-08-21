/**
 * Admin CARFAX Settings Query — Read operations for platform-level CARFAX config.
 */
import { supabase } from "@/integrations/supabase/client";

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
  const { data } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", "carfax")
    .maybeSingle();

  return data?.value ? (data.value as unknown as CarfaxConfig) : null;
}

export async function fetchCarfaxExportStats(): Promise<CarfaxExportStats> {
  const [{ count }, { data: lastExport }] = await Promise.all([
    supabase.from("carfax_exports").select("*", { count: "exact", head: true }),
    supabase
      .from("carfax_exports")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    total: count || 0,
    lastExport: lastExport?.created_at || null,
  };
}

/**
 * Queries for CRM ↔ Assets linkage and folder listing.
 */
import { supabase } from "@/integrations/supabase/client";
import type { AssetRecord } from "@/application/commands/assets.command";

export interface ServiceSummary {
  id: string;
  service_number: string | null;
  service_type: string;
  service_date: string;
  customer_id: string | null;
  customer_name: string | null;
}

/** Lightweight search across the user's services + linked customer name. */
export async function searchServicesForLinking(
  query: string,
  limit = 25,
): Promise<ServiceSummary[]> {
  let q = supabase
    .from("services")
    .select(
      "id, service_number, service_type, service_date, customer_id, customers!fk_services_customer(first_name,last_name)",
    )
    .order("service_date", { ascending: false })
    .limit(limit);

  const term = query.trim();
  if (term) {
    q = q.or(
      `service_number.ilike.%${term}%,service_type.ilike.%${term}%,description.ilike.%${term}%`,
    );
  }

  const { data, error } = await q;
  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    service_number: row.service_number,
    service_type: row.service_type,
    service_date: row.service_date,
    customer_id: row.customer_id,
    customer_name: row.customers
      ? [row.customers.first_name, row.customers.last_name].filter(Boolean).join(" ") || null
      : null,
  }));
}

/** Distinct folders for the current user (excluding soft-deleted). */
export async function listAssetFolders(): Promise<string[]> {
  const { data, error } = await supabase
    .from("assets")
    .select("folder")
    .is("deleted_at", null)
    .not("folder", "is", null);
  if (error) throw error;
  const set = new Set<string>();
  (data ?? []).forEach((r: any) => {
    if (r.folder && typeof r.folder === "string") set.add(r.folder);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/** Assets attached to a given service record. */
export async function listAssetsForService(serviceId: string): Promise<AssetRecord[]> {
  const { data, error } = await supabase
    .from("service_assets")
    .select("asset:assets!service_assets_asset_id_fkey(*)")
    .eq("service_id", serviceId);
  if (error) throw error;
  return (data ?? [])
    .map((r: any) => r.asset as AssetRecord)
    .filter((a) => a && !a.deleted_at);
}

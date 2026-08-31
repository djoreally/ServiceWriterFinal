/** Queries for CRM ↔ Assets linkage. Asset storage itself is not yet rebuilt on Final. */
import { productionSupabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import type { AssetRecord } from "@/application/commands/assets.command";

export interface ServiceSummary {
  id: string;
  service_number: string | null;
  service_type: string;
  service_date: string;
  customer_id: string | null;
  customer_name: string | null;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Lightweight search across canonical service records + linked customer name. */
export async function searchServicesForLinking(query: string, limit = 25): Promise<ServiceSummary[]> {
  const context = await resolveCurrentWorkspace();
  if (!context) return [];
  const { data, error } = await productionSupabase.from("service_records")
    .select("id,customer_id,work_performed,metadata,completed_at,created_at,customers(first_name,last_name,company_name)")
    .eq("workspace_id", context.workspaceId)
    .neq("status", "voided")
    .order("completed_at", { ascending: false, nullsFirst: false })
    .limit(Math.max(limit * 4, limit));
  if (error) throw error;

  const term = query.trim().toLowerCase();
  return (data ?? [])
    .map((row): ServiceSummary => {
      const metadata = object(row.metadata);
      const customer = row.customers;
      const serviceNumber = metadata.service_number ? String(metadata.service_number) : row.id.slice(0, 8).toUpperCase();
      const serviceType = String(metadata.service_type ?? metadata.title ?? row.work_performed ?? "Service");
      const serviceDate = (row.completed_at ?? row.created_at)?.slice(0, 10) ?? "";
      const customerName = customer
        ? [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim() || customer.company_name || null
        : null;
      return { id: row.id, service_number: serviceNumber, service_type: serviceType, service_date: serviceDate, customer_id: row.customer_id ?? null, customer_name: customerName };
    })
    .filter((row) => !term || [row.service_number, row.service_type, row.customer_name].some((value) => value?.toLowerCase().includes(term)))
    .slice(0, limit);
}

/** Final does not have the retired assets subsystem yet. */
export async function listAssetFolders(): Promise<string[]> {
  return [];
}

/** Final does not have the retired service_assets linkage yet. */
export async function listAssetsForService(_serviceId: string): Promise<AssetRecord[]> {
  return [];
}

/** Queries for CRM ↔ Assets linkage. Asset storage itself is not yet rebuilt on Final. */
import { apiClient } from "@/lib/api-client";
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

interface ServiceRecordBundle {
  id: string;
  customer_id: string | null;
  work_performed: string | null;
  metadata: unknown;
  completed_at: string | null;
  created_at: string;
  customers: { first_name: string | null; last_name: string | null; company_name: string | null } | null;
}

/** Lightweight search across canonical service records + linked customer name. */
export async function searchServicesForLinking(query: string, limit = 25): Promise<ServiceSummary[]> {
  const context = await resolveCurrentWorkspace();
  if (!context) return [];
  const response = await apiClient.get<{ data: ServiceRecordBundle[] }>("/v1/service-records/search-for-linking", {
    query: { workspace_id: context.workspaceId, limit },
  });

  const term = query.trim().toLowerCase();
  return (response.data ?? [])
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

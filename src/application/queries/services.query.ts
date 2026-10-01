/**
 * Services Query - Read operations for service catalog
 */
import { apiClient } from "@/lib/api-client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface ServiceCatalogItem {
  id: string;
  name: string;
  description: string | null;
  default_price: number;
  estimated_duration: number | null;
  category: string | null;
}

interface ServiceCatalogRow {
  id: string;
  name: string;
  description: string | null;
  default_price: number | null;
  labor_price: number | null;
  estimated_duration: number | null;
  estimated_minutes: number | null;
  category: string | null;
  sort_order: number | null;
  is_active: boolean | null;
}

function mapItem(row: ServiceCatalogRow): ServiceCatalogItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    default_price: Number(row.default_price ?? row.labor_price ?? 0),
    estimated_duration: row.estimated_duration ?? row.estimated_minutes ?? null,
    category: row.category ?? null,
  };
}

/**
 * Fetch all active services for the current workspace. tenantUserId is
 * retained for caller compatibility only; identity and workspace come from
 * the session token and the active workspace.
 */
export async function fetchServices(_tenantUserId?: string): Promise<ServiceCatalogItem[]> {
  const context = await resolveCurrentWorkspace();
  if (!context) return [];
  const response = await apiClient.get<{ data: ServiceCatalogRow[] }>("/v1/service-catalog", {
    query: { workspace_id: context.workspaceId },
  });
  return (response.data ?? [])
    .map((row) => ({ row, sortOrder: Number(row.sort_order ?? 0) }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.row.name.localeCompare(b.row.name))
    .map(({ row }) => mapItem(row));
}

/** Fetch a single service by ID. */
export async function fetchServiceById(
  _tenantUserId: string,
  serviceId: string,
): Promise<ServiceCatalogItem | null> {
  const items = await fetchServices(_tenantUserId);
  return items.find((item) => item.id === serviceId) ?? null;
}

/** Service package writes through canonical workspace-scoped RPCs. */
import { apiClient } from "@/lib/api-client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface PackageFormPayload {
  name: string; description: string | null; package_price: number; discount_type: string;
  discount_value: number; is_active: boolean; estimated_duration: number | null;
}
export interface PackageItemPayload { service_catalog_id: string; quantity: number; override_price: number | null; }

async function workspaceId(): Promise<string> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("No active workspace is available.");
  return context.workspaceId;
}

export async function createServicePackage(payload: PackageFormPayload, items: PackageItemPayload[]): Promise<string> {
  const selected_workspace_id = await workspaceId();
  const { data } = await apiClient.post<{ data: string }>("/v1/platform/service-packages/upsert", {
    selected_workspace_id,
    name: payload.name,
    description: payload.description,
    package_price: payload.package_price,
    discount_type: payload.discount_type,
    discount_value: payload.discount_value,
    is_active: payload.is_active,
    estimated_duration: payload.estimated_duration,
    items,
  });
  return String(data);
}

export async function updateServicePackage(packageId: string, payload: PackageFormPayload, items: PackageItemPayload[]): Promise<void> {
  const selected_workspace_id = await workspaceId();
  await apiClient.post("/v1/platform/service-packages/upsert", {
    selected_workspace_id,
    package_id: packageId,
    name: payload.name,
    description: payload.description,
    package_price: payload.package_price,
    discount_type: payload.discount_type,
    discount_value: payload.discount_value,
    is_active: payload.is_active,
    estimated_duration: payload.estimated_duration,
    items,
  });
}

export async function deleteServicePackage(packageId: string): Promise<void> {
  const selected_workspace_id = await workspaceId();
  await apiClient.delete(`/v1/platform/service-packages/${encodeURIComponent(packageId)}`, {
    query: { selected_workspace_id },
  });
}

export async function toggleServicePackageActive(packageId: string, isActive: boolean): Promise<void> {
  const selected_workspace_id = await workspaceId();
  await apiClient.patch(`/v1/platform/service-packages/${encodeURIComponent(packageId)}/toggle`, {
    selected_workspace_id,
    is_active: isActive,
  });
}

export async function loadTemplatePackages(): Promise<number> {
  const selected_workspace_id = await workspaceId();
  const { data } = await apiClient.post<{ data: number }>("/v1/platform/service-packages/load-templates", {
    selected_workspace_id,
  });
  return Number(data ?? 0);
}

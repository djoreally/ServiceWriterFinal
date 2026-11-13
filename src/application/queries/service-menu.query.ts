/** Service Menu — client adapter over the /v1/service-menu Hono routes. */
import { apiClient } from "@/lib/api-client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import type {
  MenuItemConfig,
  MenuSettingsConfig,
  MenuValidation,
  ResolvedMenu,
} from "@/lib/service-menu/menu";

export interface ServiceMenuBuilderState {
  settings: MenuSettingsConfig;
  items: MenuItemConfig[];
  menu: ResolvedMenu | null;
  issues: MenuValidation;
}

export interface ServiceMenuItemInput {
  role: "core" | "combo" | "side";
  service_catalog_id?: string | null;
  package_id?: string | null;
  is_most_popular?: boolean;
  with_service_price?: number | null;
  display_name?: string | null;
  is_draft?: boolean;
  sort_order?: number;
}

async function workspaceId(): Promise<string | null> {
  const context = await resolveCurrentWorkspace();
  return context?.workspaceId ?? null;
}

export async function fetchServiceMenu(): Promise<ServiceMenuBuilderState | null> {
  const ws = await workspaceId();
  if (!ws) return null;
  const response = await apiClient.get<{ data: ServiceMenuBuilderState }>(
    "/v1/service-menu",
    { query: { workspace_id: ws } },
  );
  return response.data ?? null;
}

export async function updateServiceMenuSettings(
  patch: Partial<{
    enabled: boolean;
    headline: string | null;
    hero_package_id: string | null;
    hero_label: string | null;
  }>,
): Promise<void> {
  const ws = await workspaceId();
  if (!ws) return;
  await apiClient.put("/v1/service-menu/settings", { workspace_id: ws, ...patch });
}

export async function addServiceMenuItem(item: ServiceMenuItemInput): Promise<void> {
  const ws = await workspaceId();
  if (!ws) return;
  await apiClient.post("/v1/service-menu/items", { workspace_id: ws, item });
}

export async function updateServiceMenuItem(
  id: string,
  item: Partial<ServiceMenuItemInput>,
): Promise<void> {
  const ws = await workspaceId();
  if (!ws) return;
  await apiClient.patch(`/v1/service-menu/items/${id}`, { workspace_id: ws, item });
}

export async function removeServiceMenuItem(id: string): Promise<void> {
  const ws = await workspaceId();
  if (!ws) return;
  await apiClient.delete(`/v1/service-menu/items/${id}`, {
    query: { workspace_id: ws },
  });
}

export async function applyServiceMenuTemplate(
  templateId: string,
): Promise<{ created: string[]; skipped: string[] } | null> {
  const ws = await workspaceId();
  if (!ws) return null;
  const response = await apiClient.post<{
    data: { created: string[]; skipped: string[] };
  }>("/v1/service-menu/apply-template", { workspace_id: ws, template_id: templateId });
  return response.data ?? null;
}

/** Public render data for a shop's booking slug; null when no menu is on. */
export async function fetchPublicServiceMenu(
  slug: string,
): Promise<ResolvedMenu | null> {
  const response = await apiClient.get<{ data: ResolvedMenu | null }>(
    "/v1/public/service-menu",
    { query: { slug } },
  );
  return response.data ?? null;
}

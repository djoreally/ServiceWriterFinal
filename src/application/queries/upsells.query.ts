/** Smart Upsells — canonical service_catalog adapter. */
import { apiClient } from "@/lib/api-client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

async function requireContext() {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Authentication required");
  const workspace = await resolveCurrentWorkspace();
  if (!workspace) throw new Error("No active workspace is available.");
  return { user, workspaceId: workspace.workspaceId };
}
function metadataObject(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
export interface UpsellItem { id: string; name: string; description: string | null; default_price: number; is_active: boolean; is_upsell: boolean; }

interface UpsellRow {
  id: string;
  name: string;
  description: string | null;
  labor_price: number | string | null;
  is_active: boolean;
  metadata: unknown;
}

function mapUpsell(row: UpsellRow): UpsellItem & { sort_order: number } {
  const metadata = metadataObject(row.metadata);
  return { id: row.id, name: row.name, description: row.description, default_price: Number(row.labor_price ?? 0), is_active: row.is_active, is_upsell: metadata.is_upsell === true, sort_order: Number(metadata.sort_order ?? 0) };
}

export async function fetchUpsells(): Promise<UpsellItem[]> {
  const { workspaceId } = await requireContext();
  const response = await apiClient.get<{ data: UpsellRow[] }>("/v1/upsells", {
    query: { workspace_id: workspaceId },
  });
  return (response.data ?? []).map(mapUpsell)
    .filter((row) => row.is_upsell)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .map(({ sort_order: _sortOrder, ...row }): UpsellItem => row);
}

export async function updateUpsell(id: string, payload: { name: string; description: string | null; default_price: number; is_active: boolean }): Promise<void> {
  const { workspaceId } = await requireContext();
  await apiClient.patch(`/v1/upsells/${id}`, {
    workspace_id: workspaceId,
    name: payload.name,
    description: payload.description,
    default_price: payload.default_price,
    is_active: payload.is_active,
  });
}

export async function toggleUpsellActive(id: string, currentlyActive: boolean): Promise<void> {
  const { workspaceId } = await requireContext();
  await apiClient.post(`/v1/upsells/${id}/toggle`, {
    workspace_id: workspaceId,
    currently_active: currentlyActive,
  });
}

export async function loadDefaultUpsellTemplates(existingNames: Set<string>): Promise<number> {
  const { workspaceId } = await requireContext();
  const defaults = [
    { name: "Engine Air Filter", description: "Replace engine air filter to improve fuel efficiency and engine performance.", price: 24.99 },
    { name: "Cabin Air Filter", description: "Replace cabin air filter for cleaner, fresher air inside the vehicle.", price: 29.99 },
    { name: "Wiper Blade Replacement", description: "Replace front and rear wiper blades for clear visibility in all weather conditions.", price: 24.99 },
  ];
  const toInsert = defaults.filter((item) => !existingNames.has(item.name.toLowerCase()));
  // Sequential: sort_order is index-derived (900 + index).
  for (const [index, item] of toInsert.entries()) {
    await apiClient.post("/v1/upsells", {
      workspace_id: workspaceId,
      name: item.name,
      description: item.description,
      default_price: item.price,
      sort_order: 900 + index,
    });
  }
  return toInsert.length;
}

export async function addUpsell(payload: { name: string; description: string | null; default_price: number }): Promise<void> {
  const { workspaceId } = await requireContext();
  await apiClient.post("/v1/upsells", {
    workspace_id: workspaceId,
    name: payload.name,
    description: payload.description,
    default_price: payload.default_price,
  });
}

/**
 * Inventory Command - canonical workspace-scoped mutations.
 */

import { apiClient } from "@/lib/api-client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface InventoryItemWritePayload {
  name: string;
  description: string | null;
  sku: string | null;
  quantity: number;
  unit?: string;
  unit_cost: number;
  sell_price: number;
  category: string | null;
  low_stock_threshold: number;
  image_url?: string | null;
  reorder_url?: string | null;
  tire_size?: string | null;
  tire_load_index?: string | null;
  tire_speed_rating?: string | null;
  tire_season?: string | null;
  tire_position?: string | null;
}

async function requireWorkspace() {
  const [{ data: { user } }, workspace] = await Promise.all([getCurrentAuthUser(), resolveCurrentWorkspace()]);
  if (!user) throw new Error("Not authenticated");
  if (!workspace?.workspaceId) throw new Error("No active workspace");
  return { user, workspaceId: workspace.workspaceId };
}

export async function uploadInventoryImage(file: File): Promise<string> {
  const { workspaceId } = await requireWorkspace();
  if (!file.type.startsWith("image/")) throw new Error("Please upload an image file");
  const form = new FormData();
  form.append("file", file);
  form.append("workspace_id", workspaceId);
  const data = await apiClient.post<{ data: { public_url: string } }>("/v1/inventory/images", form);
  return data.data.public_url;
}

export async function createInventoryItem(payload: InventoryItemWritePayload): Promise<void> {
  const { workspaceId } = await requireWorkspace();
  await apiClient.post("/v1/inventory/items", { workspace_id: workspaceId, item: payload });
}

export async function updateInventoryItem(id: string, payload: InventoryItemWritePayload): Promise<void> {
  const { workspaceId } = await requireWorkspace();
  await apiClient.patch(`/v1/inventory/items/${id}`, { workspace_id: workspaceId, item: payload });
}

export async function deleteInventoryItem(id: string): Promise<void> {
  const { workspaceId } = await requireWorkspace();
  await apiClient.delete(`/v1/inventory/items/${id}`, { query: { workspace_id: workspaceId } });
}

export async function transferInventoryToVan(params: { itemId: string; vanId: string; quantity: number }): Promise<void> {
  await requireWorkspace();
  await apiClient.post("/v1/inventory/transfer", {
    item_id: params.itemId,
    to_location_id: params.vanId,
    quantity: params.quantity,
  });
}

export async function reconcileServiceOilUsage(params: {
  serviceRecordId: string;
  inventoryItemId: string;
  locationId?: string | null;
}): Promise<string> {
  await requireWorkspace();
  const data = await apiClient.post<{ data: { movement_id: string | null } }>("/v1/inventory/reconcile-oil", {
    service_record_id: params.serviceRecordId,
    inventory_item_id: params.inventoryItemId,
    location_id: params.locationId ?? null,
  });
  if (!data.data.movement_id) throw new Error("Oil usage reconciliation did not return a movement");
  return String(data.data.movement_id);
}

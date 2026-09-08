/**
 * Inventory Command - canonical workspace-scoped mutations.
 */

import { supabase } from "@/integrations/supabase/client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
const db = supabase as any;

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
  const { user, workspaceId } = await requireWorkspace();
  if (!file.type.startsWith("image/")) throw new Error("Please upload an image file");
  const ext = file.name.split(".").pop() || "jpg";
  const filePath = `inventory/${workspaceId}/${user.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("service-images").upload(filePath, file, { upsert: false, contentType: file.type });
  if (error) throw new Error(error.message);
  return supabase.storage.from("service-images").getPublicUrl(filePath).data.publicUrl;
}

export async function createInventoryItem(payload: InventoryItemWritePayload): Promise<void> {
  const { user, workspaceId } = await requireWorkspace();
  const { quantity, ...itemFields } = payload;
  const { data, error } = await db
    .from("inventory_items")
    .insert({ ...itemFields, quantity: 0, workspace_id: workspaceId, user_id: user.id, is_active: true })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const stockResult = await db.rpc("set_inventory_item_stock", { p_item_id: data.id, p_quantity: quantity, p_reason: "initial stock" });
  if (stockResult.error) throw new Error(stockResult.error.message);
}

export async function updateInventoryItem(id: string, payload: InventoryItemWritePayload): Promise<void> {
  const { workspaceId } = await requireWorkspace();
  const { quantity, ...itemFields } = payload;
  const { error } = await db
    .from("inventory_items")
    .update(itemFields)
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .eq("is_active", true);
  if (error) throw new Error(error.message);
  const stockResult = await db.rpc("set_inventory_item_stock", { p_item_id: id, p_quantity: quantity, p_reason: "inventory item edit" });
  if (stockResult.error) throw new Error(stockResult.error.message);
}

export async function deleteInventoryItem(id: string): Promise<void> {
  const { workspaceId } = await requireWorkspace();
  const { error } = await db
    .from("inventory_items")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function transferInventoryToVan(params: { itemId: string; vanId: string; quantity: number }): Promise<void> {
  await requireWorkspace();
  const { error } = await db.rpc("transfer_inventory_stock", {
    p_item_id: params.itemId,
    p_to_location_id: params.vanId,
    p_quantity: params.quantity,
    p_idempotency_key: `inventory-transfer-${crypto.randomUUID()}`,
  });
  if (error) throw new Error(error.message);
}

export async function reconcileServiceOilUsage(params: {
  serviceRecordId: string;
  inventoryItemId: string;
  locationId?: string | null;
}): Promise<string> {
  await requireWorkspace();
  const { data, error } = await db.rpc("reconcile_service_oil_usage", {
    p_service_record_id: params.serviceRecordId,
    p_inventory_item_id: params.inventoryItemId,
    p_location_id: params.locationId ?? null,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Oil usage reconciliation did not return a movement");
  return String(data);
}

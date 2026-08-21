/**
 * Inventory Command - Write operations for inventory and van stock.
 */

import { supabase } from "@/integrations/supabase/client";
import { enqueueInventoryTransfer, processOfflineOutbox } from "@/offline/outbox";
import { isOfflineEligibleForCurrentUser } from "@/offline/rollout";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
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

export async function uploadInventoryImage(file: File): Promise<string> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");

  if (!file.type.startsWith("image/")) {
    throw new Error("Please upload an image file");
  }

  const ext = file.name.split(".").pop() || "jpg";
  const filePath = `inventory/${user.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("service-images")
    .upload(filePath, file, { upsert: true, contentType: file.type });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from("service-images").getPublicUrl(filePath);
  return data.publicUrl;
}

export async function createInventoryItem(payload: InventoryItemWritePayload): Promise<void> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("inventory_items")
    .insert({ ...payload, user_id: user.id } as any);
  if (error) throw new Error(error.message);
}

export async function updateInventoryItem(id: string, payload: InventoryItemWritePayload): Promise<void> {
  const { error } = await supabase
    .from("inventory_items")
    .update(payload as any)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteInventoryItem(id: string): Promise<void> {
  const { error } = await supabase
    .from("inventory_items")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function transferInventoryToVan(params: {
  itemId: string;
  vanId: string;
  quantity: number;
}): Promise<void> {
  if (await isOfflineEligibleForCurrentUser()) {
    await enqueueInventoryTransfer(params);
    await processOfflineOutbox();
    return;
  }

  // Single transactional path: the RPC decrements warehouse stock, upserts van
  // stock, and writes the ledger entry together. The old client-side fallback
  // did those as separate writes and could leave the two stock rows disagreeing.
  const { error } = await supabase.rpc("transfer_inventory_to_van", {
    p_item_id: params.itemId,
    p_van_id: params.vanId,
    p_quantity: params.quantity,
    p_idempotency_key: `inventory-transfer-${params.vanId}-${params.itemId}-${params.quantity}-${Date.now()}`,
  });

  if (error) throw new Error(error.message);
}


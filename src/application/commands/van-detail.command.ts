/**
 * Van Detail Command - Write operations for van detail page.
 */

import { supabase } from "@/integrations/supabase/client";

export interface UpdateVanPayload {
  name: string;
  vin: string | null;
  license_plate: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  status: string;
  assigned_technician_id: string | null;
}

export async function updateVan(vanId: string, payload: UpdateVanPayload): Promise<void> {
  const { error } = await supabase.from("vans").update(payload).eq("id", vanId);
  if (error) throw new Error(error.message);
}

export async function addVanTerritory(vanId: string, zipCode: string): Promise<void> {
  const { error } = await supabase.from("van_territories").insert([{ van_id: vanId, zip_code: zipCode }]);
  if (error) {
    if (error.code === "23505") throw new Error("Zip code already assigned to this van");
    throw new Error(error.message);
  }
}

export async function bulkAddVanTerritories(vanId: string, zipCodes: string[]): Promise<void> {
  const inserts = zipCodes.map(zip_code => ({ van_id: vanId, zip_code }));
  const { error } = await supabase.from("van_territories").insert(inserts);
  if (error) throw new Error("Some zip codes may already exist");
}

export async function removeVanTerritory(territoryId: string): Promise<void> {
  const { error } = await supabase.from("van_territories").delete().eq("id", territoryId);
  if (error) throw new Error(error.message);
}

export async function toggleTerritoryPrimary(territoryId: string, currentValue: boolean): Promise<void> {
  const { error } = await supabase.from("van_territories").update({ is_primary: !currentValue }).eq("id", territoryId);
  if (error) throw new Error(error.message);
}

export async function restockVan(vanId: string, itemId: string, quantity: number): Promise<void> {
  const { error } = await supabase.rpc("restock_van", {
    p_van_id: vanId,
    p_item_id: itemId,
    p_quantity: quantity,
  });
  if (error) throw new Error(error.message);
}

export async function addVanInventoryItem(vanId: string, itemId: string, quantity: number, minQuantity: number): Promise<void> {
  const { error } = await supabase.from("van_inventory").insert([{
    van_id: vanId,
    inventory_item_id: itemId,
    quantity,
    min_quantity: minQuantity,
  }]);
  if (error) {
    if (error.code === "23505") throw new Error("Item already on this van");
    throw new Error(error.message);
  }
}

/**
 * Decode a VIN via the NHTSA edge function.
 */
export async function decodeVin(vin: string): Promise<{ year?: number; make?: string; model?: string }> {
  const { data, error } = await supabase.functions.invoke("vin-decode", { body: { vin } });
  if (error) throw new Error("VIN decode failed");
  return data ?? {};
}

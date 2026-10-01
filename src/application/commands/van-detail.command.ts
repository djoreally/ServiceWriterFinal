/**
 * Van Detail Command - Write operations for van detail page.
 */

import { apiClient, ApiClientError } from "@/lib/api-client";

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
  try {
    await apiClient.patch(`/v1/vans/${vanId}`, { payload });
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Failed to update van");
  }
}

export async function addVanTerritory(vanId: string, zipCode: string): Promise<void> {
  try {
    await apiClient.post(`/v1/vans/${vanId}/territories`, { zip_code: zipCode });
  } catch (error) {
    if (error instanceof ApiClientError && error.code === "duplicate_territory") {
      throw new Error("Zip code already assigned to this van");
    }
    throw new Error(error instanceof Error ? error.message : "Failed to add territory");
  }
}

export async function bulkAddVanTerritories(vanId: string, zipCodes: string[]): Promise<void> {
  try {
    await apiClient.post(`/v1/vans/${vanId}/territories/bulk`, { zip_codes: zipCodes });
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Some zip codes may already exist");
  }
}

export async function removeVanTerritory(territoryId: string): Promise<void> {
  try {
    await apiClient.delete(`/v1/van-territories/${territoryId}`);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Failed to remove territory");
  }
}

export async function toggleTerritoryPrimary(territoryId: string, currentValue: boolean): Promise<void> {
  try {
    await apiClient.patch(`/v1/van-territories/${territoryId}`, { current_value: currentValue });
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Failed to update territory");
  }
}

export async function restockVan(vanId: string, itemId: string, quantity: number): Promise<void> {
  try {
    await apiClient.post(`/v1/vans/${vanId}/restock`, { item_id: itemId, quantity });
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Failed to restock van");
  }
}

export async function addVanInventoryItem(vanId: string, itemId: string, quantity: number, minQuantity: number): Promise<void> {
  try {
    await apiClient.post(`/v1/vans/${vanId}/inventory`, {
      item_id: itemId,
      quantity,
      min_quantity: minQuantity,
    });
  } catch (error) {
    if (error instanceof ApiClientError && error.code === "duplicate_inventory_item") {
      throw new Error("Item already on this van");
    }
    throw new Error(error instanceof Error ? error.message : "Failed to add inventory item");
  }
}

/**
 * Decode a VIN via the vin-decode provider.
 */
export async function decodeVin(vin: string): Promise<{ year?: number; make?: string; model?: string }> {
  try {
    const { data } = await apiClient.post<{ data: { year?: number; make?: string; model?: string } }>(
      "/v1/vin/decode",
      { vin },
    );
    return data ?? {};
  } catch {
    throw new Error("VIN decode failed");
  }
}

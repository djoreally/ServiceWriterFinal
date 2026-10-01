/**
 * Van Detail Query - Read operations for van detail page.
 */

import { apiClient } from "@/lib/api-client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface VanDetailData {
  id: string;
  name: string;
  vin: string | null;
  license_plate: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  status: string;
  is_active: boolean;
  assigned_technician_id: string | null;
  capacity_notes: string | null;
}

export interface VanTerritory {
  id: string;
  zip_code: string;
  is_primary: boolean;
}

export interface VanInventoryItem {
  id: string;
  inventory_item_id: string;
  quantity: number;
  min_quantity: number;
  last_restocked_at: string | null;
  item_name?: string;
  item_sku?: string;
  warehouse_qty?: number;
}

export interface VanAppointment {
  id: string;
  title: string;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
  guest_name: string | null;
}

export interface VanTechnician {
  id: string;
  name: string;
}

export interface WarehouseItem {
  id: string;
  name: string;
  sku: string | null;
  quantity: number;
}

export interface VanDetailResult {
  van: VanDetailData | null;
  territories: VanTerritory[];
  inventory: VanInventoryItem[];
  appointments: VanAppointment[];
  technicians: VanTechnician[];
  warehouseItems: WarehouseItem[];
}

/**
 * Fetch all data needed for the van detail page in parallel.
 */
export async function fetchVanDetail(vanId: string): Promise<VanDetailResult> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return { van: null, territories: [], inventory: [], appointments: [], technicians: [], warehouseItems: [] };

  const { data } = await apiClient.get<{
    data: {
      van: VanDetailData | null;
      territories: VanTerritory[];
      inventory: Record<string, any>[];
      appointments: VanAppointment[];
      technicians: VanTechnician[];
      warehouseItems: WarehouseItem[];
    };
  }>(`/v1/vans/${vanId}/detail`);

  const inventory = (data?.inventory || []).map((i: any) => ({
    ...i,
    item_name: i.inventory_items?.name,
    item_sku: i.inventory_items?.sku,
    warehouse_qty: i.inventory_items?.quantity,
  })) as VanInventoryItem[];

  return {
    van: (data?.van ?? null) as VanDetailData | null,
    territories: (data?.territories ?? []) as VanTerritory[],
    inventory,
    appointments: (data?.appointments ?? []) as VanAppointment[],
    technicians: (data?.technicians ?? []) as VanTechnician[],
    warehouseItems: (data?.warehouseItems ?? []) as WarehouseItem[],
  };
}

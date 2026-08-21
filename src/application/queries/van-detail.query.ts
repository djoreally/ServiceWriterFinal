/**
 * Van Detail Query - Read operations for van detail page.
 */

import { supabase } from "@/integrations/supabase/client";

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

  // ⚡ Parallel fetch: all six queries run concurrently
  const [vanRes, terrRes, invRes, apptsRes, techRes, whRes] = await Promise.all([
    supabase.from("vans").select("*").eq("id", vanId).eq("user_id", user.id).single(),
    supabase.from("van_territories").select("*").eq("van_id", vanId).order("zip_code"),
    supabase.from("van_inventory").select("*, inventory_items(name, sku, quantity)").eq("van_id", vanId),
    supabase.from("appointments")
      .select("id, title, scheduled_date, scheduled_time, status, guest_name")
      .eq("assigned_van_id", vanId)
      .order("scheduled_date", { ascending: false })
      .limit(50),
    supabase.from("technicians").select("id, name").eq("user_id", user.id).eq("is_active", true).order("name"),
    supabase.from("inventory_items").select("id, name, sku, quantity").eq("user_id", user.id).order("name"),
  ]);

  const van = vanRes.data as VanDetailData | null;
  const territories = (terrRes.data || []) as VanTerritory[];
  const inventory = (invRes.data || []).map((i: any) => ({
    ...i,
    item_name: i.inventory_items?.name,
    item_sku: i.inventory_items?.sku,
    warehouse_qty: i.inventory_items?.quantity,
  })) as VanInventoryItem[];
  const appointments = (apptsRes.data || []) as VanAppointment[];
  const technicians = (techRes.data || []) as VanTechnician[];
  const warehouseItems = (whRes.data || []) as WarehouseItem[];

  return { van, territories, inventory, appointments, technicians, warehouseItems };
}

/**
 * Inventory Query - Read operations for inventory and van stock.
 */

import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface InventoryItem {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  quantity: number;
  unit: string;
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

export interface Van {
  id: string;
  name: string;
}

export interface VanInventoryLink {
  inventory_item_id: string;
  van_id: string;
  quantity: number;
}

export interface ReservationLink {
  inventory_item_id: string;
  quantity: number;
  source: string;
  van_id: string | null;
}

export interface InventoryOverviewResult {
  items: InventoryItem[];
  vans: Van[];
  vanInventory: VanInventoryLink[];
  reservations: ReservationLink[];
}

export async function fetchInventoryOverview(): Promise<InventoryOverviewResult> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) {
    return { items: [], vans: [], vanInventory: [], reservations: [] };
  }

  const [itemsRes, vansRes, vanInvRes, reservationsRes] = await Promise.all([
    supabase
      .from("inventory_items")
      .select("*")
      .eq("user_id", user.id)
      .order("name"),
    supabase
      .from("vans")
      .select("id, name")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("van_inventory")
      .select("inventory_item_id, van_id, quantity"),
    supabase
      .from("inventory_reservations")
      .select("inventory_item_id, quantity, source, van_id")
      .eq("user_id", user.id)
      .eq("status", "reserved"),
  ]);

  if (itemsRes.error) {
    console.error("[fetchInventoryOverview] items error", itemsRes.error);
    throw new Error(itemsRes.error.message || "Failed to fetch inventory");
  }

  const items = (itemsRes.data || []) as InventoryItem[];
  const vans = (vansRes.data || []) as Van[];
  const vanInventory = (vanInvRes.data || []) as VanInventoryLink[];
  const reservations = (reservationsRes.data || []) as ReservationLink[];

  return { items, vans, vanInventory, reservations };
}

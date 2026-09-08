/**
 * Inventory Query - canonical workspace-scoped inventory reads.
 * Oil usage is intentionally not sourced from these tables.
 */
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
const db = supabase as any;

export interface InventoryItem { id:string; name:string; description:string|null; sku:string|null; quantity:number; unit:string; unit_cost:number; sell_price:number; category:string|null; low_stock_threshold:number; image_url?:string|null; reorder_url?:string|null; tire_size?:string|null; tire_load_index?:string|null; tire_speed_rating?:string|null; tire_season?:string|null; tire_position?:string|null }
export interface Van { id:string; name:string }
export interface VanInventoryLink { inventory_item_id:string; van_id:string; quantity:number }
export interface ReservationLink { inventory_item_id:string; quantity:number; source:string; van_id:string|null }
export interface InventoryOverviewResult { items:InventoryItem[]; vans:Van[]; vanInventory:VanInventoryLink[]; reservations:ReservationLink[] }

export async function fetchInventoryOverview(): Promise<InventoryOverviewResult> {
  const workspace = await resolveCurrentWorkspace();
  if (!workspace?.workspaceId) return { items:[], vans:[], vanInventory:[], reservations:[] };
  const workspaceId = workspace.workspaceId;
  const [itemsRes, locationsRes, stockRes, reservationsRes] = await Promise.all([
    db.from("inventory_items").select("id,name,description,sku,unit,unit_cost,sell_price,category,low_stock_threshold,image_url,reorder_url,tire_size,tire_load_index,tire_speed_rating,tire_season,tire_position").eq("workspace_id",workspaceId).eq("is_active",true).order("name"),
    db.from("inventory_locations").select("id,name,location_type").eq("workspace_id",workspaceId).eq("is_active",true).order("name"),
    db.from("inventory_stock").select("inventory_item_id,location_id,quantity").eq("workspace_id",workspaceId),
    db.from("inventory_reservations").select("inventory_item_id,quantity,location_id,status").eq("workspace_id",workspaceId).eq("status","reserved"),
  ]);
  for (const result of [itemsRes,locationsRes,stockRes,reservationsRes]) if (result.error) throw new Error(result.error.message || "Failed to fetch inventory");

  const locations = (locationsRes.data ?? []) as Array<{id:string;name:string;location_type:string}>;
  const stock = (stockRes.data ?? []) as Array<{inventory_item_id:string;location_id:string;quantity:number|string}>;
  const warehouseIds = new Set(locations.filter((l)=>l.location_type==="warehouse").map((l)=>l.id));
  const warehouseQty = new Map<string,number>();
  for (const row of stock) if (warehouseIds.has(row.location_id)) warehouseQty.set(row.inventory_item_id,(warehouseQty.get(row.inventory_item_id)??0)+Number(row.quantity??0));
  const items = ((itemsRes.data ?? []) as Omit<InventoryItem,"quantity">[]).map((item)=>({...item,quantity:warehouseQty.get(item.id)??0}));
  const nonWarehouseLocations = locations.filter((l)=>l.location_type!=="warehouse");
  const vans:Van[] = nonWarehouseLocations.map((l)=>({id:l.id,name:l.name}));
  const nonWarehouseIds = new Set(nonWarehouseLocations.map((l)=>l.id));
  const vanInventory:VanInventoryLink[] = stock.filter((row)=>nonWarehouseIds.has(row.location_id)).map((row)=>({inventory_item_id:row.inventory_item_id,van_id:row.location_id,quantity:Number(row.quantity??0)}));
  const reservations:ReservationLink[] = ((reservationsRes.data ?? []) as Array<{inventory_item_id:string;quantity:number|string;location_id:string|null;status:string}>).map((row)=>({inventory_item_id:row.inventory_item_id,quantity:Number(row.quantity??0),source:row.location_id&&nonWarehouseIds.has(row.location_id)?"location":"warehouse",van_id:row.location_id&&nonWarehouseIds.has(row.location_id)?row.location_id:null}));
  return { items,vans,vanInventory,reservations };
}

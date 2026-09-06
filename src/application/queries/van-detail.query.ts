/** Van Detail Query - Read operations for van detail page. */
import { supabase } from "@/integrations/supabase/client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
export interface VanDetailData{id:string;name:string;vin:string|null;license_plate:string|null;make:string|null;model:string|null;year:number|null;status:string;is_active:boolean;assigned_technician_id:string|null;capacity_notes:string|null;}
export interface VanTerritory{id:string;zip_code:string;is_primary:boolean;}
export interface VanInventoryItem{id:string;inventory_item_id:string;quantity:number;min_quantity:number;last_restocked_at:string|null;item_name?:string;item_sku?:string;warehouse_qty?:number;}
export interface VanAppointment{id:string;title:string;scheduled_date:string;scheduled_time:string;status:string;guest_name:string|null;}
export interface VanTechnician{id:string;name:string;}
export interface WarehouseItem{id:string;name:string;sku:string|null;quantity:number;}
export interface VanDetailResult{van:VanDetailData|null;territories:VanTerritory[];inventory:VanInventoryItem[];appointments:VanAppointment[];technicians:VanTechnician[];warehouseItems:WarehouseItem[];}
export async function fetchVanDetail(vanId:string):Promise<VanDetailResult>{
 const {data:{user}}=await getCurrentAuthUser();if(!user)return{van:null,territories:[],inventory:[],appointments:[],technicians:[],warehouseItems:[]};
 const context=await resolveCurrentWorkspace();if(!context)return{van:null,territories:[],inventory:[],appointments:[],technicians:[],warehouseItems:[]};
 const [vanRes,terrRes,invRes,memberRes,whRes]=await Promise.all([
  supabase.from("vans").select("*").eq("id",vanId).eq("user_id",user.id).single(),
  supabase.from("van_territories").select("*").eq("van_id",vanId).order("zip_code"),
  supabase.from("van_inventory").select("*, inventory_items(name, sku, quantity)").eq("van_id",vanId),
  (supabase as any).from("workspace_members").select("user_id,role,is_active,profiles!workspace_members_user_id_fkey(display_name)").eq("workspace_id",context.workspaceId).eq("is_active",true),
  supabase.from("inventory_items").select("id, name, sku, quantity").eq("user_id",user.id).order("name"),
 ]);
 const van=vanRes.data as VanDetailData|null;const territories=(terrRes.data||[]) as VanTerritory[];
 const inventory=(invRes.data||[]).map((i:any)=>({...i,item_name:i.inventory_items?.name,item_sku:i.inventory_items?.sku,warehouse_qty:i.inventory_items?.quantity})) as VanInventoryItem[];
 const technicians=(memberRes.data??[]).filter((m:any)=>m.role==="technician").map((m:any)=>({id:m.user_id,name:m.profiles?.display_name||"Technician"})) as VanTechnician[];
 const warehouseItems=(whRes.data||[]) as WarehouseItem[];
 // Canonical appointments no longer carry assigned_van_id. Van-specific scheduling must be supplied by dispatch metadata/assignments rather than querying retired appointment columns.
 const appointments:VanAppointment[]=[];
 return{van,territories,inventory,appointments,technicians,warehouseItems};
}

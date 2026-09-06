/**
 * Vehicle Parts Registry Command — write operations for per-vehicle part numbers
 * and for applying/consuming parts on work orders.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import type { VehicleKind } from "@/application/queries/vehicle-parts-registry.query";
import { getCurrentAuthUser } from "@/lib/auth/current-user";

export interface VehiclePartInput { part_category:string; part_number:string; brand?:string|null; oem_number?:string|null; quantity?:number; unit?:string|null; inventory_item_id?:string|null; is_required?:boolean; notes?:string|null; }
async function requireUser():Promise<string>{const {data:{user}}=await getCurrentAuthUser();if(!user)throw new Error("Not authenticated");return user.id;}
async function resolveVehicleWorkspace(vehicleId:string):Promise<string>{const {data,error}=await supabase.from("vehicles").select("workspace_id").eq("id",vehicleId).maybeSingle();if(error)throw new Error(error.message);if(!data?.workspace_id)throw new Error("Vehicle not found");return data.workspace_id;}

export async function addVehiclePart(kind:VehicleKind,vehicleId:string,input:VehiclePartInput):Promise<void>{
  const actorId=await requireUser(); const workspaceId=await resolveVehicleWorkspace(vehicleId);
  const row={user_id:actorId,workspace_id:workspaceId,vehicle_kind:kind,fleet_vehicle_id:null,vehicle_id:vehicleId,part_category:input.part_category,part_number:input.part_number.trim(),brand:input.brand?.trim()||null,oem_number:input.oem_number?.trim()||null,quantity:input.quantity??1,unit:input.unit||null,inventory_item_id:input.inventory_item_id||null,is_required:input.is_required??true,notes:input.notes?.trim()||null,verified_by:actorId,verified_at:new Date().toISOString()};
  const {error}=await (supabase as any).from("vehicle_part_assignments").insert(row); if(error){if(error.code==="23505")throw new Error("That part number is already assigned to this vehicle");throw new Error(error.message);}
}
export async function updateVehiclePart(id:string,input:VehiclePartInput):Promise<void>{const actorId=await requireUser();const {error}=await supabase.from("vehicle_part_assignments").update({part_category:input.part_category,part_number:input.part_number.trim(),brand:input.brand?.trim()||null,oem_number:input.oem_number?.trim()||null,quantity:input.quantity??1,unit:input.unit||null,inventory_item_id:input.inventory_item_id||null,is_required:input.is_required??true,notes:input.notes?.trim()||null,verified_by:actorId,verified_at:new Date().toISOString()}).eq("id",id);if(error)throw new Error(error.message);}
export async function deleteVehiclePart(id:string):Promise<void>{const {error}=await supabase.from("vehicle_part_assignments").delete().eq("id",id);if(error)throw new Error(error.message);}

export async function promotePartsToSpecReference(params:{year:number|null;make:string|null;model:string|null;engine:string|null;parts:Array<{part_category:string;part_number:string}>;}):Promise<void>{
  const {year,make,model,engine,parts}=params;if(!year||!make||!model)return;
  type VehicleSpecUpdate=Database["public"]["Tables"]["vehicle_specifications"]["Update"];type PartColumn="oil_filter"|"air_filter"|"cabin_filter"|"fuel_filter"|"wiper_blade_driver"|"wiper_blade_passenger"|"wiper_blade_rear";
  const map:Record<string,PartColumn>={oil_filter:"oil_filter",air_filter:"air_filter",cabin_filter:"cabin_filter",fuel_filter:"fuel_filter",wiper_blade_driver:"wiper_blade_driver",wiper_blade_passenger:"wiper_blade_passenger",wiper_blade_rear:"wiper_blade_rear"};
  const payload:VehicleSpecUpdate={};for(const p of parts){const col=map[p.part_category];if(col&&p.part_number)payload[col]=p.part_number;}if(!Object.keys(payload).length)return;
  const {data:existing}=await supabase.from("vehicle_specifications").select("id").eq("year",year).ilike("make",make).ilike("model",model).maybeSingle();
  if(existing?.id)await supabase.from("vehicle_specifications").update(payload).eq("id",existing.id);else await supabase.from("vehicle_specifications").insert({year,make,model,engine:engine||null,source:"shop_confirmed",...payload});
}

export interface WorkOrderPartLineInput { description:string; part_number?:string|null; quantity:number; unit_price:number; inventory_item_id?:string|null; van_id?:string|null; fleet_vehicle_id?:string|null; unit?:string|null; }
export async function applyWorkOrderParts(workOrderId:string,lines:WorkOrderPartLineInput[]):Promise<{lines:number;reservations:number}>{const normalized=lines.map(line=>({...line,fleet_vehicle_id:null}));const {data,error}=await supabase.rpc("apply_work_order_parts_v1",{p_work_order_id:workOrderId,p_lines:normalized as unknown as Json});if(error)throw new Error(error.message);const result=data&&typeof data==="object"&&!Array.isArray(data)?data:{};return{lines:typeof result.lines==="number"?result.lines:0,reservations:typeof result.reservations==="number"?result.reservations:0};}
export async function consumeWorkOrderParts(workOrderId:string):Promise<{consumed:number}>{const {data,error}=await supabase.rpc("consume_work_order_parts_v1",{p_work_order_id:workOrderId});if(error)throw new Error(error.message);const result=data&&typeof data==="object"&&!Array.isArray(data)?data:{};return{consumed:typeof result.consumed==="number"?result.consumed:0};}

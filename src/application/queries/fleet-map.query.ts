/** Fleet Map Query - canonical staff identity with legacy van display data. */
import { supabase } from '@/integrations/supabase/client';
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
export interface FleetMapVan{id:string;name:string;status:string;color:string|null;make:string|null;model:string|null;year:number|null;license_plate:string|null;zipCodes:{zip_code:string;is_primary:boolean}[];technician:{id:string;name:string;status:string;current_location:{lat:number;lng:number}|null}|null;currentLocation:{lat:number;lng:number}|null;todayJobCount:number;}
export async function fetchFleetMapData():Promise<FleetMapVan[]>{
 const context=await resolveCurrentWorkspace();if(!context)return[];const db=supabase as any;
 const [vansRes,territoriesRes,membersRes]=await Promise.all([
  db.from('vans').select('id,name,status,color,make,model,year,license_plate,assigned_technician_id').eq('is_active',true),
  db.from('van_territories').select('van_id,zip_code,is_primary'),
  db.from('workspace_members').select('user_id,role,is_active,profiles!workspace_members_user_id_fkey(display_name)').eq('workspace_id',context.workspaceId).eq('is_active',true),
 ]);
 if(!vansRes.data)return[];const techMap=new Map<string,{id:string;name:string;status:string;current_location:null}>();for(const member of membersRes.data??[]){if(member.role!=="technician")continue;techMap.set(member.user_id,{id:member.user_id,name:member.profiles?.display_name||"Technician",status:"available",current_location:null});}
 const territoryMap:Record<string,{zip_code:string;is_primary:boolean}[]>={};for(const t of territoriesRes.data??[]){(territoryMap[t.van_id]??=[]).push({zip_code:t.zip_code,is_primary:t.is_primary===true});}
 return vansRes.data.map((van:any)=>{const tech=van.assigned_technician_id?techMap.get(van.assigned_technician_id)??null:null;return{id:van.id,name:van.name,status:van.status,color:van.color??null,make:van.make??null,model:van.model??null,year:van.year??null,license_plate:van.license_plate??null,zipCodes:territoryMap[van.id]||[],technician:tech,currentLocation:null,todayJobCount:0};});
}

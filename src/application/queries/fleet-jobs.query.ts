import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { FleetWorkOrderSummary } from "./fleet.query";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
export type FleetJobRow=Database["public"]["Tables"]["fleet_jobs"]["Row"];
export interface FleetJobDetail extends FleetJobRow{fleet_clients?:{id:string;company_name:string|null}|null;fleet_locations?:{id:string;name:string|null;address:string|null;city:string|null;state:string|null}|null;technicians?:{id:string;name:string|null}|null;work_orders:FleetWorkOrderSummary[];}
export async function fetchFleetJobDetail(jobId:string):Promise<FleetJobDetail|null>{
 const context=await resolveCurrentWorkspace();if(!context)return null;const db=supabase as any;
 const{data,error}=await db.from("fleet_jobs").select("*, fleet_clients(id, company_name), fleet_locations(id, name, address, city, state)").eq("id",jobId).maybeSingle();if(error)throw error;if(!data)return null;
 const{data:orders,error:ordersError}=await db.from("work_orders").select("id,workspace_id,appointment_id,customer_id,vehicle_id,status,priority,number,complaint,diagnosis,technician_notes,opened_at,completed_at,created_at,updated_at,metadata,vehicles(year,make,model,metadata),customers(company_name)").eq("workspace_id",context.workspaceId).contains("metadata",{fleet_job_id:jobId}).order("created_at",{ascending:true});if(ordersError)throw ordersError;
 const mapped=(orders??[]).map((row:any)=>{const meta=row.metadata&&typeof row.metadata==="object"&&!Array.isArray(row.metadata)?row.metadata:{};return{...row,order_number:String(row.number??row.id.slice(0,8)),service_type:String(meta.requested_service||row.complaint||"Work order"),scheduled_date:row.opened_at?String(row.opened_at).slice(0,10):"",scheduled_time:row.opened_at?String(row.opened_at).slice(11,16):null,fleet_vehicles:row.vehicles?{...row.vehicles,unit_number:row.vehicles.metadata?.unit_number??null}:null,fleet_clients:row.customers?{company_name:row.customers.company_name}:null,fleet_locations:null,fleet_jobs:{id:jobId,job_number:data.job_number??null}}) as FleetWorkOrderSummary;
 return{...(data as Omit<FleetJobDetail,"work_orders">),technicians:null,work_orders:mapped};
}

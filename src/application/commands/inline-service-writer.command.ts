/** Inline Service Writer Commands — canonical write operations for Command Center. */
import { supabase } from "@/integrations/supabase/client";
import { requestAppointmentProviderSync } from "./provider-sync.command";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import { getCurrentAuthUser } from "@/lib/auth/current-user";

function splitName(name:string){const parts=name.trim().split(/\s+/).filter(Boolean);return{first_name:parts.shift()||"Customer",last_name:parts.length?parts.join(" "):null};}
export async function createInlineCustomer(_userId:string,data:{name:string;email:string|null;phone:string|null}){
  const context=await resolveCurrentWorkspace();if(!context)return{data:null,error:new Error("No active workspace")};
  const {data:{user}}=await getCurrentAuthUser();const names=splitName(data.name);
  return supabase.from("customers").insert({workspace_id:context.workspaceId,...names,email:data.email,phone:data.phone,created_by:user?.id??null}).select("id").single();
}

export async function createInlineAppointment(data:{user_id:string;title:string;scheduled_date:string;scheduled_time:string;duration_minutes:number;customer_id:string|null;guest_name:string|null;guest_email:string|null;guest_phone:string|null;location_address:string|null;estimated_cost:number;job_priority:string;notes:string|null;status:string;source:string;service_catalog_id:string|null;}){
  const context=await resolveCurrentWorkspace();if(!context)return{data:null,error:new Error("No active workspace")};
  const {data:{user}}=await getCurrentAuthUser();
  const starts=new Date(`${data.scheduled_date}T${data.scheduled_time||"09:00"}:00`);const ends=new Date(starts.getTime()+(data.duration_minutes||60)*60_000);
  const result=await supabase.from("appointments").insert({workspace_id:context.workspaceId,customer_id:data.customer_id,status:data.status as never,starts_at:starts.toISOString(),ends_at:ends.toISOString(),source:data.source,notes:data.notes,created_by:user?.id??null,metadata:{title:data.title,guest_name:data.guest_name,guest_email:data.guest_email,guest_phone:data.guest_phone,location_address:data.location_address,estimated_cost:data.estimated_cost,job_priority:data.job_priority,service_catalog_id:data.service_catalog_id,duration_minutes:data.duration_minutes}}).select("id").single();
  if(!result.error&&result.data?.id){requestAppointmentProviderSync({appointmentId:result.data.id,syncMode:"appointment_created",guestEmail:data.guest_email}).catch(error=>console.warn("[createInlineAppointment] provider sync failed",error));}
  return result;
}

export async function insertAppointmentServiceItems(items:Array<{appointment_id:string;service_catalog_id:string;name:string;price:number;quantity:number;}>) {
  const context=await resolveCurrentWorkspace();if(!context)return{data:null,error:new Error("No active workspace")};
  return supabase.from("appointment_items").insert(items.map((item,index)=>({workspace_id:context.workspaceId,appointment_id:item.appointment_id,service_catalog_id:item.service_catalog_id,item_type:"service",description:item.name,quantity:item.quantity,unit_price:item.price,sort_order:index})));
}

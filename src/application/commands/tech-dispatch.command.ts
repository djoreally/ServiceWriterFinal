/** Tech Dispatch Commands — canonical staff identity wrappers. */
import { supabase } from "@/integrations/supabase/client";
import { nextApi } from "@/lib/nextApiClient";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";
import { getCurrentAuthUser } from "@/lib/auth/current-user";

export interface TechStatusUpdate { technician_id:string; new_status:'available'|'en_route'|'on_job'|'on_break'|'unavailable'|'offline'; appointment_id?:string; location?:{lat:number;lng:number}; }
export interface DispatchNotification { type:'job_assigned'|'job_updated'|'job_cancelled'|'route_optimized'|'urgent_message'; technician_id:string; appointment_id?:string; message?:string; metadata?:Record<string,any>; }
export async function updateTechnicianStatus(update:TechStatusUpdate){return supabase.functions.invoke('tech-dispatch-sync',{body:{action:'update_tech_status',data:update}});}
export async function sendDispatchNotification(notification:DispatchNotification){return supabase.functions.invoke('tech-dispatch-sync',{body:{action:'dispatch_notification',data:notification}});}
export async function syncTechnicianDailyLoad(technician_id:string,date:string){return supabase.functions.invoke('tech-dispatch-sync',{body:{action:'sync_daily_load',data:{technician_id,date}}});}
export async function updateTechnicianLocation(technician_id:string,location:{lat:number;lng:number}){return supabase.functions.invoke('tech-dispatch-sync',{body:{action:'update_location',data:{technician_id,location}}});}
export async function clockInTechnician(location?:{lat:number;lng:number}){return supabase.rpc('clock_in',{p_location:location?JSON.stringify(location):null});}
export async function clockOutTechnician(location?:{lat:number;lng:number}){return supabase.rpc('clock_out',{p_location:location?JSON.stringify(location):null});}
export async function startBreak(){
  const {data:{user}}=await getCurrentAuthUser();if(!user)throw new Error('Not authenticated');
  const {data:shift}=await supabase.from('time_clock_entries').select('id').eq('user_id',user.id).eq('status','active').order('clock_in',{ascending:false}).limit(1).maybeSingle();
  if(!shift)throw new Error('No active shift found');
  const {error}=await supabase.from('time_clock_entries').update({status:'on_break',break_start:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',shift.id);if(error)throw error;
  return{success:true};
}
export async function endBreak(){return supabase.rpc('end_break');}

async function actor(){const workspace_id=getSelectedWorkspaceId();if(!workspace_id)throw new Error('Select a workspace before updating a job.');const{data:{user}}=await getCurrentAuthUser();if(!user)throw new Error('Not authenticated');const{data:membership}=await supabase.from('workspace_members').select('user_id,is_active').eq('workspace_id',workspace_id).eq('user_id',user.id).eq('is_active',true).maybeSingle();if(!membership)throw new Error('Active workspace membership required');return{workspace_id,userId:user.id};}
export async function acceptJobAssignment(appointment_id:string){const{workspace_id,userId}=await actor();await nextApi.dispatchEvents.create({workspace_id,appointment_id,technician_id:userId,event_type:'status_changed',new_status:'acknowledged',notes:'Technician acknowledged job assignment'});return{success:true};}
export async function markEnRoute(appointment_id:string,location?:{lat:number;lng:number}){const{workspace_id,userId}=await actor();await nextApi.dispatchEvents.create({workspace_id,appointment_id,technician_id:userId,event_type:'en_route',new_status:'en_route',location:location??null,notes:'Technician is en route'});return{success:true};}
export async function markArrived(appointment_id:string,location?:{lat:number;lng:number}){const{workspace_id,userId}=await actor();await nextApi.dispatchEvents.create({workspace_id,appointment_id,technician_id:userId,event_type:'arrived',new_status:'arrived',location:location??null,notes:'Technician arrived at job site'});return{success:true};}
export async function startJob(appointment_id:string){const{workspace_id,userId}=await actor();await nextApi.appointments.update(appointment_id,{workspace_id,status:'in_progress'});await nextApi.dispatchEvents.create({workspace_id,appointment_id,technician_id:userId,event_type:'started',new_status:'in_progress',notes:'Technician started work'});return{success:true};}

/** Dispatch Guardrails — canonical pre-assignment validation. */
import { supabase } from "@/integrations/supabase/client";
import { findScheduleConflict, wouldExceedCapacity, type ScheduleSlot } from "./dispatch-state";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface AssignmentValidation { valid:boolean; warnings:string[]; errors:string[]; }

export async function validateAssignment(technicianId:string,jobDate:string,jobTime:string,jobDurationMinutes:number,excludeAppointmentId?:string):Promise<AssignmentValidation>{
  const errors:string[]=[]; const warnings:string[]=[];
  const context=await resolveCurrentWorkspace(); if(!context) return {valid:false,errors:["No active workspace"],warnings:[]};
  const [{data:member},{data:profile}]=await Promise.all([
    supabase.from("workspace_members").select("user_id,role,is_active").eq("workspace_id",context.workspaceId).eq("user_id",technicianId).maybeSingle(),
    supabase.from("profiles").select("display_name").eq("id",technicianId).maybeSingle(),
  ]);
  if(!member) return {valid:false,errors:["Technician not found"],warnings:[]};
  const name=profile?.display_name||"Technician";
  if(!member.is_active) errors.push(`${name} is not active`);

  const startOfDay=new Date(`${jobDate}T00:00:00`); const endOfDay=new Date(`${jobDate}T23:59:59.999`);
  let query=supabase.from("appointments").select("id,starts_at,ends_at,status").eq("workspace_id",context.workspaceId).eq("assigned_user_id",technicianId).gte("starts_at",startOfDay.toISOString()).lte("starts_at",endOfDay.toISOString()).not("status","in",'("cancelled","completed")');
  if(excludeAppointmentId) query=query.neq("id",excludeAppointmentId);
  const {data:existingJobs}=await query;
  const slots:ScheduleSlot[]=(existingJobs??[]).map((j)=>{
    const starts=new Date(j.starts_at); const ends=j.ends_at?new Date(j.ends_at):new Date(starts.getTime()+60*60_000);
    return {scheduledTime:starts.toISOString().slice(11,16),durationMinutes:Math.max(1,Math.round((ends.getTime()-starts.getTime())/60_000))};
  });
  const proposed:ScheduleSlot={scheduledTime:jobTime.substring(0,5),durationMinutes:jobDurationMinutes||60};
  const conflict=findScheduleConflict(slots,proposed,15); if(conflict) errors.push(`Time conflict: overlaps with existing job at ${conflict.scheduledTime} (${conflict.durationMinutes}min)`);
  const totalExistingMinutes=slots.reduce((sum,s)=>sum+s.durationMinutes,0); const maxHours=8;
  if(wouldExceedCapacity(totalExistingMinutes/60,jobDurationMinutes,maxHours)) warnings.push(`${name} would be at ${((totalExistingMinutes+jobDurationMinutes)/60).toFixed(1)}h / ${maxHours}h capacity`);
  return {valid:errors.length===0,warnings,errors};
}

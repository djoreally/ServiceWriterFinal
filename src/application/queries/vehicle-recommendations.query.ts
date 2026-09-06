/** Vehicle Recommendations Queries & Commands */
import { supabase } from "@/integrations/supabase/client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface Recommendation { id:string; vehicle_id:string; recommendation_type:string; title:string; description:string|null; priority:"high"|"medium"|"low"; due_mileage:number|null; due_date:string|null; is_dismissed:boolean; last_service_mileage:number|null; last_service_date:string|null; interval_miles:number|null; interval_months:number|null; }
export interface MaintenanceInterval { id:string; service_type:string; title:string; description:string|null; default_interval_miles:number|null; default_interval_months:number|null; priority:"high"|"medium"|"low"; }

export async function fetchVehicleRecommendations(vehicleId:string):Promise<Recommendation[]> {
  const { data:{ user } } = await getCurrentAuthUser(); if(!user) return [];
  const { data,error } = await supabase.from("vehicle_recommendations").select("*").eq("vehicle_id",vehicleId).eq("user_id",user.id).eq("is_dismissed",false).order("priority",{ascending:true});
  if(error||!data) return [];
  return (data as Recommendation[]).sort((a,b)=>({high:0,medium:1,low:2}[a.priority]??2)-({high:0,medium:1,low:2}[b.priority]??2));
}
export async function fetchMaintenanceIntervals():Promise<MaintenanceInterval[]> { const {data}=await supabase.from("maintenance_intervals").select("*").order("title"); return (data||[]) as MaintenanceInterval[]; }
export async function dismissRecommendation(id:string):Promise<void>{ const {error}=await supabase.from("vehicle_recommendations").update({is_dismissed:true,dismissed_at:new Date().toISOString()}).eq("id",id); if(error) throw new Error("Failed to dismiss"); }
export async function deleteRecommendation(id:string):Promise<void>{ const {error}=await supabase.from("vehicle_recommendations").delete().eq("id",id); if(error) throw new Error("Failed to mark complete"); }
export async function addRecommendation(rec:{vehicle_id:string;recommendation_type:string;title:string;description?:string|null;priority:string;due_mileage?:number|null;due_date?:string|null;interval_miles?:number|null;interval_months?:number|null;}):Promise<void>{ const {data:{user}}=await getCurrentAuthUser(); if(!user) throw new Error("Not authenticated"); const {error}=await supabase.from("vehicle_recommendations").insert([{...rec,user_id:user.id}]); if(error) throw new Error("Failed to add recommendation"); }

export async function generateRecommendationsFromHistory(vehicleId:string,currentMileage:number|null,intervals:MaintenanceInterval[]):Promise<number>{
  const {data:{user}}=await getCurrentAuthUser(); if(!user) return 0;
  const context=await resolveCurrentWorkspace(); if(!context) return 0;
  const [recordsRes,existingRes]=await Promise.all([
    supabase.from("service_records").select("id,work_performed,complaint,diagnosis,completed_at,started_at,created_at,metadata").eq("workspace_id",context.workspaceId).eq("vehicle_id",vehicleId).order("completed_at",{ascending:false}),
    supabase.from("vehicle_recommendations").select("recommendation_type").eq("vehicle_id",vehicleId).eq("user_id",user.id).eq("is_dismissed",false),
  ]);
  const records=(recordsRes.data||[]).map((r)=>({
    ...r,
    service_text:[r.work_performed,r.complaint,r.diagnosis].filter(Boolean).join(" ").toLowerCase(),
    service_date:r.completed_at||r.started_at||r.created_at,
  }));
  const existingTypes=new Set((existingRes.data||[]).map(r=>r.recommendation_type));
  const {addMonths,format,isBefore,addDays}=await import("date-fns"); const newRecs:any[]=[];
  for(const interval of intervals){
    if(existingTypes.has(interval.service_type)) continue;
    const needle=interval.service_type.replace("_"," ").toLowerCase();
    const lastService=records.find((r)=>r.service_text.includes(needle));
    let dueMileage:number|null=null,dueDate:string|null=null,shouldAdd=false;
    if(lastService){
      if(interval.default_interval_miles&&currentMileage){ const lastMileage=currentMileage-interval.default_interval_miles; dueMileage=lastMileage+interval.default_interval_miles; if(currentMileage>=dueMileage-500) shouldAdd=true; }
      if(interval.default_interval_months&&lastService.service_date){ dueDate=format(addMonths(new Date(lastService.service_date),interval.default_interval_months),"yyyy-MM-dd"); if(isBefore(new Date(dueDate),addDays(new Date(),30))) shouldAdd=true; }
    } else if(interval.default_interval_miles&&currentMileage){ dueMileage=Math.ceil(currentMileage/interval.default_interval_miles)*interval.default_interval_miles; if(currentMileage>=dueMileage-500) shouldAdd=true; }
    if(shouldAdd) newRecs.push({vehicle_id:vehicleId,recommendation_type:interval.service_type,title:interval.title,description:interval.description,priority:interval.priority,due_mileage:dueMileage,due_date:dueDate,interval_miles:interval.default_interval_miles,interval_months:interval.default_interval_months,last_service_mileage:null,last_service_date:lastService?.service_date||null,user_id:user.id});
  }
  if(newRecs.length){ const {error}=await supabase.from("vehicle_recommendations").insert(newRecs); if(error) throw new Error("Failed to generate recommendations"); }
  return newRecs.length;
}

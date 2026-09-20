/** Command Center Query — server-authorized Service Writer operational reads. */
import { nextApi } from "@/lib/nextApiClient";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import type { OperationalJobRow } from "./operational-jobs.query";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(value: unknown): string | null { return typeof value === "string" && value ? value : null; }
function localParts(iso: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit", hourCycle:"h23" }).formatToParts(new Date(iso));
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}:${p.second}` };
}
function name(customer:any): string | null {
  if (!customer) return null;
  return [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim() || customer.company_name || null;
}
function address(row:any): string | null {
  if (!row) return null;
  return [row.address_line1,row.address_line2,row.city,row.region,row.postal_code].filter(Boolean).join(", ") || null;
}
async function read(dateStr:string) {
  const context=await resolveCurrentWorkspace();
  if(!context) return null;
  return (await nextApi.commandCenter.get(context.workspaceId,dateStr)).data;
}
export async function fetchTodayJobs(_userId:string,dateStr:string) {
  try {
    const data=await read(dateStr);
    if(!data) return {data:[],error:null};
    const profiles=new Map<string,string>((data.members as any[]).map((m:any)=>[m.user_id,m.profiles?.display_name || ""]));
    const jobs:OperationalJobRow[]=[];
    for(const row of data.appointments as any[]) {
      const meta=object(row.metadata), start=localParts(row.starts_at,data.timezone), duration=Math.max(15,Math.round((new Date(row.ends_at).getTime()-new Date(row.starts_at).getTime())/60000));
      const assigned=row.assigned_user_id ?? null;
      jobs.push({job_id:row.id,user_id:"",title:String(meta.title??meta.service_name??"Appointment"),scheduled_date:start.date,scheduled_time:start.time,status:row.status,dispatch_status:String(meta.dispatch_status??(assigned?"assigned":"unassigned")),canonical_state:row.status,job_priority:text(meta.job_priority),estimated_duration_minutes:duration,duration_minutes:duration,assigned_technician_id:assigned,assigned_technician_name:assigned?profiles.get(assigned)||null:null,assigned_van_id:null,assigned_van_name:null,assigned_at:text(meta.assigned_at),dispatch_notes:text(meta.dispatch_notes),guest_name:text(meta.guest_name),guest_phone:text(meta.guest_phone),location_address:address(row.locations)??address(row.customers),location_lat:row.locations?.latitude==null?null:Number(row.locations.latitude),location_lng:row.locations?.longitude==null?null:Number(row.locations.longitude),estimated_cost:meta.estimated_cost==null?null:Number(meta.estimated_cost),source:"appointment",customer_name:name(row.customers),customer_phone:row.customers?.phone??null,vehicle_year:row.vehicles?.year??null,vehicle_make:row.vehicles?.make??null,vehicle_model:row.vehicles?.model??null,service_catalog_name:text(meta.service_name),last_event_at:row.updated_at??null,source_freshness_ms:row.updated_at?Math.max(0,Date.now()-new Date(row.updated_at).getTime()):null});
    }
    for(const row of data.work_orders as any[]) {
      const meta=object(row.metadata), raw=text(meta.scheduled_at)??row.opened_at??row.created_at, start=localParts(raw,data.timezone);
      const active=(row.work_order_assignments??[]).find((a:any)=>!a.unassigned_at), assigned=active?.user_id??null;
      jobs.push({job_id:row.id,user_id:"",title:String(meta.title??`Repair Order RO-${row.number}`),scheduled_date:start.date,scheduled_time:start.time,status:row.status,dispatch_status:assigned?"assigned":"unassigned",canonical_state:row.status,job_priority:row.priority??null,estimated_duration_minutes:meta.duration_minutes==null?60:Number(meta.duration_minutes),duration_minutes:meta.duration_minutes==null?60:Number(meta.duration_minutes),assigned_technician_id:assigned,assigned_technician_name:assigned?profiles.get(assigned)||null:null,assigned_van_id:null,assigned_van_name:null,assigned_at:text(meta.assigned_at),dispatch_notes:text(meta.dispatch_notes)??row.technician_notes,guest_name:null,guest_phone:null,location_address:address(row.locations)??address(row.customers)??text(meta.location_address),location_lat:row.locations?.latitude==null?(meta.location_lat==null?null:Number(meta.location_lat)):Number(row.locations.latitude),location_lng:row.locations?.longitude==null?(meta.location_lng==null?null:Number(meta.location_lng)):Number(row.locations.longitude),estimated_cost:meta.estimated_cost==null?null:Number(meta.estimated_cost),source:"work_order",fleet_job_id:text(meta.fleet_job_id),fleet_job_number:text(meta.fleet_job_number),fleet_job_vehicle_count:meta.fleet_vehicle_count==null?null:Number(meta.fleet_vehicle_count),customer_name:name(row.customers),customer_phone:row.customers?.phone??null,vehicle_year:row.vehicles?.year??null,vehicle_make:row.vehicles?.make??null,vehicle_model:row.vehicles?.model??null,service_catalog_name:null,last_event_at:row.updated_at??null,source_freshness_ms:row.updated_at?Math.max(0,Date.now()-new Date(row.updated_at).getTime()):null});
    }
    jobs.sort((a,b)=>`${a.scheduled_date}T${a.scheduled_time}`.localeCompare(`${b.scheduled_date}T${b.scheduled_time}`));
    return {data:jobs,error:null};
  } catch(error){ return {data:null,error:error instanceof Error?error:new Error("Failed to load dispatch jobs")}; }
}
export async function fetchActiveTechnicians(_userId:string,dateStr?:string) {
  try {
    const context=await resolveCurrentWorkspace(); if(!context) return {data:[],error:null};
    const date=dateStr || new Intl.DateTimeFormat("en-CA",{timeZone:context.timezone||"UTC"}).format(new Date());
    const data=await read(date); if(!data) return {data:[],error:null};
    return {data:(data.technicians as any[]).map((t:any)=>({...t,avatar_url:null,assigned_van_id:null})),error:null};
  } catch(error){ return {data:null,error:error instanceof Error?error:new Error("Failed to load technicians")}; }
}

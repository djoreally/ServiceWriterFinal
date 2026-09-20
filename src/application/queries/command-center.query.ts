/** Command Center Query — server-authorized Service Writer operational reads. */
import { nextApi } from "@/lib/nextApiClient";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import type { OperationalJobRow } from "./operational-jobs.query";

type RelatedCustomer = { first_name?: string | null; last_name?: string | null; company_name?: string | null; phone?: string | null; address_line1?: string | null; address_line2?: string | null; city?: string | null; region?: string | null; postal_code?: string | null };
type RelatedLocation = RelatedCustomer & { latitude?: number | null; longitude?: number | null };
type RelatedVehicle = { year?: number | null; make?: string | null; model?: string | null };
type MemberRow = { user_id: string; profiles?: { display_name?: string | null } | Array<{ display_name?: string | null }> | null };
type AssignmentRow = { user_id: string; assigned_at?: string | null; unassigned_at?: string | null };
type AppointmentRow = { id:string; status:string; starts_at:string; ends_at:string; assigned_user_id:string|null; updated_at:string|null; metadata:unknown; customers?:RelatedCustomer|null; vehicles?:RelatedVehicle|null; locations?:RelatedLocation|null };
type WorkOrderRow = { id:string; number:number; status:string; priority:string|null; opened_at:string|null; created_at:string; updated_at:string|null; technician_notes:string|null; metadata:unknown; customers?:RelatedCustomer|null; vehicles?:RelatedVehicle|null; locations?:RelatedLocation|null; work_order_assignments?:AssignmentRow[] };
type TechnicianRow = { id:string; name:string; status:string; current_location:null };

function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function text(value: unknown): string | null { return typeof value === "string" && value ? value : null; }
function localParts(iso:string, timezone:string) {
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(new Date(iso));
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}:${p.second}`};
}
function related<T>(value:T|T[]|null|undefined):T|null { return Array.isArray(value) ? value[0] ?? null : value ?? null; }
function customerName(customer:RelatedCustomer|null):string|null { return customer ? ([customer.first_name,customer.last_name].filter(Boolean).join(" ").trim() || customer.company_name || null) : null; }
function address(row:RelatedCustomer|null):string|null { return row ? [row.address_line1,row.address_line2,row.city,row.region,row.postal_code].filter(Boolean).join(", ") || null : null; }
async function read(dateStr:string) { const context=await resolveCurrentWorkspace(); if(!context) return null; return (await nextApi.commandCenter.get(context.workspaceId,dateStr)).data; }

export async function fetchTodayJobs(_userId:string,dateStr:string) {
 try {
  const data=await read(dateStr); if(!data) return {data:[],error:null};
  const members=data.members as MemberRow[];
  const profiles = new Map<string, string>(members.map((m): [string, string] => { const p = related(m.profiles); return [m.user_id, p?.display_name || ""]; }));
  const jobs:OperationalJobRow[]=[];
  for(const row of data.appointments as AppointmentRow[]) {
   const meta=object(row.metadata), start=localParts(row.starts_at,data.timezone), duration=Math.max(15,Math.round((new Date(row.ends_at).getTime()-new Date(row.starts_at).getTime())/60000));
   const assigned=row.assigned_user_id??null, customer=related(row.customers), vehicle=related(row.vehicles), location=related(row.locations);
   jobs.push({job_id:row.id,user_id:"",title:String(meta.title??meta.service_name??"Appointment"),scheduled_date:start.date,scheduled_time:start.time,status:row.status,dispatch_status:String(meta.dispatch_status??(assigned?"assigned":"unassigned")),canonical_state:row.status,job_priority:text(meta.job_priority),estimated_duration_minutes:duration,duration_minutes:duration,assigned_technician_id:assigned,assigned_technician_name:assigned?profiles.get(assigned)||null:null,assigned_van_id:null,assigned_van_name:null,assigned_at:text(meta.assigned_at),dispatch_notes:text(meta.dispatch_notes),guest_name:text(meta.guest_name),guest_phone:text(meta.guest_phone),location_address:address(location)??address(customer),location_lat:location?.latitude==null?null:Number(location.latitude),location_lng:location?.longitude==null?null:Number(location.longitude),estimated_cost:meta.estimated_cost==null?null:Number(meta.estimated_cost),source:"appointment",customer_name:customerName(customer),customer_phone:customer?.phone??null,vehicle_year:vehicle?.year??null,vehicle_make:vehicle?.make??null,vehicle_model:vehicle?.model??null,service_catalog_name:text(meta.service_name),last_event_at:row.updated_at,source_freshness_ms:row.updated_at?Math.max(0,Date.now()-new Date(row.updated_at).getTime()):null});
  }
  for(const row of data.work_orders as WorkOrderRow[]) {
   const meta=object(row.metadata), raw=text(meta.scheduled_at)??row.opened_at??row.created_at, start=localParts(raw,data.timezone), active=(row.work_order_assignments??[]).find(a=>!a.unassigned_at), assigned=active?.user_id??null;
   const customer=related(row.customers), vehicle=related(row.vehicles), location=related(row.locations);
   jobs.push({job_id:row.id,user_id:"",title:String(meta.title??`Repair Order RO-${row.number}`),scheduled_date:start.date,scheduled_time:start.time,status:row.status,dispatch_status:assigned?"assigned":"unassigned",canonical_state:row.status,job_priority:row.priority,estimated_duration_minutes:meta.duration_minutes==null?60:Number(meta.duration_minutes),duration_minutes:meta.duration_minutes==null?60:Number(meta.duration_minutes),assigned_technician_id:assigned,assigned_technician_name:assigned?profiles.get(assigned)||null:null,assigned_van_id:null,assigned_van_name:null,assigned_at:text(meta.assigned_at),dispatch_notes:text(meta.dispatch_notes)??row.technician_notes,guest_name:null,guest_phone:null,location_address:address(location)??address(customer)??text(meta.location_address),location_lat:location?.latitude==null?(meta.location_lat==null?null:Number(meta.location_lat)):Number(location.latitude),location_lng:location?.longitude==null?(meta.location_lng==null?null:Number(meta.location_lng)):Number(location.longitude),estimated_cost:meta.estimated_cost==null?null:Number(meta.estimated_cost),source:"work_order",fleet_job_id:text(meta.fleet_job_id),fleet_job_number:text(meta.fleet_job_number),fleet_job_vehicle_count:meta.fleet_vehicle_count==null?null:Number(meta.fleet_vehicle_count),customer_name:customerName(customer),customer_phone:customer?.phone??null,vehicle_year:vehicle?.year??null,vehicle_make:vehicle?.make??null,vehicle_model:vehicle?.model??null,service_catalog_name:null,last_event_at:row.updated_at,source_freshness_ms:row.updated_at?Math.max(0,Date.now()-new Date(row.updated_at).getTime()):null});
  }
  jobs.sort((a,b)=>`${a.scheduled_date}T${a.scheduled_time}`.localeCompare(`${b.scheduled_date}T${b.scheduled_time}`));
  return {data:jobs,error:null};
 } catch(error){return {data:null,error:error instanceof Error?error:new Error("Failed to load dispatch jobs")};}
}
export async function fetchActiveTechnicians(_userId:string,dateStr:string) {
 try { const data=await read(dateStr); if(!data)return {data:[],error:null}; return {data:(data.technicians as TechnicianRow[]).map(t=>({...t,avatar_url:null,assigned_van_id:null})),error:null}; }
 catch(error){return {data:null,error:error instanceof Error?error:new Error("Failed to load technicians")};}
}

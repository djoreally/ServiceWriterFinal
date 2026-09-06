/** Inspections Queries - Read operations for inspection templates and items. */
import { supabase } from "@/integrations/supabase/client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface InspectionTemplate { id:string; name:string; description:string|null; category:string; is_active:boolean; created_at:string; }
export interface InspectionItem { id:string; template_id:string; name:string; description:string|null; category:string|null; is_required:boolean; sort_order:number; }
export interface InspectionTemplateData { templates:InspectionTemplate[]; items:Record<string,InspectionItem[]>; }
export async function fetchInspectionTemplates():Promise<InspectionTemplateData>{
  const {data:{user}}=await getCurrentAuthUser();if(!user)throw new Error("Authentication required");
  const {data:templates,error}=await supabase.from("inspection_templates").select("*").eq("user_id",user.id).order("created_at",{ascending:false});if(error)throw error;
  const templateList=templates??[];let items:Record<string,InspectionItem[]>={};
  if(templateList.length){const{data:itemsData}=await supabase.from("inspection_items").select("*").in("template_id",templateList.map(t=>t.id)).order("sort_order");if(itemsData)items=itemsData.reduce((acc,item)=>{if(!acc[item.template_id])acc[item.template_id]=[];acc[item.template_id].push(item);return acc;},{} as Record<string,InspectionItem[]>);}
  return{templates:templateList,items};
}

export interface AppointmentInspectionGate { required:{templateId:string;templateName:string;completed:boolean}[]; pendingCount:number; }
export async function fetchAppointmentInspectionGate(appointmentId:string):Promise<AppointmentInspectionGate>{
  const context=await resolveCurrentWorkspace();if(!context)return{required:[],pendingCount:0};
  const {data:appt}=await supabase.from("appointments").select("id").eq("id",appointmentId).eq("workspace_id",context.workspaceId).maybeSingle();if(!appt)return{required:[],pendingCount:0};
  const {data:items}=await supabase.from("appointment_items").select("service_catalog_id,description").eq("workspace_id",context.workspaceId).eq("appointment_id",appointmentId);
  const catalogIds=[...new Set((items??[]).map(item=>item.service_catalog_id).filter((id):id is string=>Boolean(id)))];
  if(!catalogIds.length)return{required:[],pendingCount:0};
  const {data:catalogRows}=await supabase.from("service_catalog").select("id,name,metadata").eq("workspace_id",context.workspaceId).in("id",catalogIds);
  const required:{templateId:string;templateName:string}[]=[];const seen=new Set<string>();
  for(const row of catalogRows??[]){const metadata=row.metadata&&typeof row.metadata==="object"&&!Array.isArray(row.metadata)?row.metadata as Record<string,unknown>:{};const tid=typeof metadata.inspection_template_id==="string"?metadata.inspection_template_id:null;if(tid&&!seen.has(tid)){required.push({templateId:tid,templateName:row.name});seen.add(tid);}}
  if(!required.length)return{required:[],pendingCount:0};
  const {data:completed}=await (supabase as any).from("service_inspections").select("template_id").eq("appointment_id",appointmentId);
  const completedTemplates=new Set((completed??[]).map((row:any)=>row.template_id));const out=required.map(r=>({...r,completed:completedTemplates.has(r.templateId)}));
  return{required:out,pendingCount:out.filter(r=>!r.completed).length};
}

/**
 * Inspection Performer Commands
 * Handles performing and saving vehicle inspections.
 */
import { supabase } from "@/integrations/supabase/client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { nextApi } from "@/lib/nextApiClient";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface InspectionResultData { item_name: string; item_category: string | null; status: string; notes: string; sort_order: number; service_catalog_id?: string | null; price?: number | null; }
export interface PerformInspectionPayload { serviceId?: string; vehicleId?: string; appointmentId?: string; templateId: string; templateName: string; inspectorName?: string; notes?: string; results: Record<string, InspectionResultData>; }

async function resolveInspectionWorkspace(payload: PerformInspectionPayload): Promise<string> {
 const db=supabase as any;
 if(payload.appointmentId){const {data,error}=await db.from("appointments").select("workspace_id").eq("id",payload.appointmentId).single();if(error)throw error;return data.workspace_id;}
 if(payload.serviceId){const {data,error}=await db.from("service_records").select("workspace_id").eq("id",payload.serviceId).single();if(error)throw error;return data.workspace_id;}
 if(payload.vehicleId){const {data,error}=await db.from("vehicles").select("workspace_id").eq("id",payload.vehicleId).single();if(error)throw error;return data.workspace_id;}
 throw new Error("Inspection must be associated with an appointment, service record, or vehicle.");
}

export async function saveInspection(payload: PerformInspectionPayload): Promise<void> {
  if (!payload.appointmentId || !payload.vehicleId) {
    throw new Error("Job-start inspections require appointment and vehicle context.");
  }

  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("No active workspace is available.");

  await nextApi.inspections.create({
    workspace_id: context.workspaceId,
    appointment_id: payload.appointmentId,
    vehicle_id: payload.vehicleId,
    service_id: payload.serviceId ?? null,
    template_id: payload.templateId,
    template_name: payload.templateName,
    inspector_name: payload.inspectorName ?? null,
    notes: payload.notes ?? null,
    results: Object.values(payload.results),
  });
}

export interface InspectionTemplateOption { id:string;name:string;description:string|null;category:string; }
export interface InspectionItemOption { id:string;template_id:string;name:string;description:string|null;category:string|null;is_required:boolean;sort_order:number; }
export interface PastInspection { id:string;template_name:string;inspector_name:string|null;inspection_date:string;notes:string|null;status:string; }
export async function fetchInspectionPerformerData(serviceId?:string,vehicleId?:string):Promise<{templates:InspectionTemplateOption[];pastInspections:PastInspection[]}>{const {data:{user}}=await getCurrentAuthUser();if(!user)return{templates:[],pastInspections:[]};const db=supabase as any;const templatesPromise=db.from("inspection_templates").select("id, name, description, category").eq("user_id",user.id).eq("is_active",true).order("name");let pastQuery=db.from("service_inspections").select("id, template_name, inspector_name, inspection_date, notes, status").order("inspection_date",{ascending:false}).limit(5);if(serviceId)pastQuery=pastQuery.eq("service_id",serviceId);if(vehicleId)pastQuery=pastQuery.eq("vehicle_id",vehicleId);const [templatesRes,pastRes]=await Promise.all([templatesPromise,pastQuery]);if(templatesRes.error)throw templatesRes.error;if(pastRes.error)throw pastRes.error;return{templates:(templatesRes.data||[]) as InspectionTemplateOption[],pastInspections:(pastRes.data||[]) as PastInspection[]};}
export async function fetchInspectionItems(templateId:string):Promise<InspectionItemOption[]>{const {data,error}=await(supabase as any).from("inspection_items").select("*").eq("template_id",templateId).order("sort_order");if(error)throw error;return(data||[]) as InspectionItemOption[];}

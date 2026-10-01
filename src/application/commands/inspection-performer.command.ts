/**
 * Inspection Performer Commands
 * Handles performing and saving vehicle inspections.
 *
 * Phase 2: all data access goes through the typed API client
 * (`@/lib/api-client`) to the appointments Hono router. Exported signatures
 * are unchanged. The server resolves the workspace from the auth token.
 */
import { apiClient } from "@/lib/api-client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";

export interface InspectionResultData { item_name: string; item_category: string | null; status: string; notes: string; sort_order: number; service_catalog_id?: string | null; price?: number | null; }
export interface PerformInspectionPayload { serviceId?: string; vehicleId?: string; appointmentId?: string; templateId: string; templateName: string; inspectorName?: string; notes?: string; results: Record<string, InspectionResultData>; }

export async function saveInspection(payload: PerformInspectionPayload): Promise<void> {
 const {data:{user}}=await getCurrentAuthUser(); if(!user)throw new Error("Not authenticated");
 if(!payload.appointmentId||!payload.vehicleId) throw new Error("Job-start inspections require appointment and vehicle context.");
 await apiClient.post("/v1/inspections/service-inspections/perform", {
   appointment_id: payload.appointmentId,
   vehicle_id: payload.vehicleId,
   service_id: payload.serviceId ?? null,
   template_id: payload.templateId,
   template_name: payload.templateName,
   inspector_name: payload.inspectorName ?? null,
   notes: payload.notes ?? null,
   results: Object.values(payload.results).map((result) => ({
     item_name: result.item_name,
     item_category: result.item_category,
     status: result.status,
     notes: result.notes || null,
     sort_order: result.sort_order,
     service_catalog_id: result.service_catalog_id ?? null,
     price: result.price ?? null,
   })),
 });
}

export interface InspectionTemplateOption { id:string;name:string;description:string|null;category:string; }
export interface InspectionItemOption { id:string;template_id:string;name:string;description:string|null;category:string|null;is_required:boolean;sort_order:number; }
export interface PastInspection { id:string;template_name:string;inspector_name:string|null;inspection_date:string;notes:string|null;status:string; }
export async function fetchInspectionPerformerData(serviceId?:string,vehicleId?:string):Promise<{templates:InspectionTemplateOption[];pastInspections:PastInspection[]}>{const {data:{user}}=await getCurrentAuthUser();if(!user)return{templates:[],pastInspections:[]};const response=await apiClient.get<{data:{templates:InspectionTemplateOption[];pastInspections:PastInspection[]}}>(`/v1/inspections/performer-data`,{query:{...(serviceId?{service_id:serviceId}:{}),...(vehicleId?{vehicle_id:vehicleId}:{})}});return{templates:response.data?.templates??[],pastInspections:response.data?.pastInspections??[]};}
export async function fetchInspectionItems(templateId:string):Promise<InspectionItemOption[]>{const response=await apiClient.get<{data:InspectionItemOption[]}>(`/v1/inspections/items`,{query:{template_id:templateId}});return response.data??[];}

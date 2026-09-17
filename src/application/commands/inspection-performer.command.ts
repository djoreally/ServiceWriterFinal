/**
 * Inspection Performer Commands
 * Handles performing and saving vehicle inspections.
 */

import { supabase } from "@/integrations/supabase/client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";

export interface InspectionResultData { item_name: string; item_category: string | null; status: string; notes: string; sort_order: number; }
export interface PerformInspectionPayload { serviceId?: string; vehicleId?: string; appointmentId?: string; templateId: string; templateName: string; inspectorName?: string; notes?: string; results: Record<string, InspectionResultData>; }

async function resolveInspectionWorkspace(payload: PerformInspectionPayload): Promise<string> {
  const db = supabase as any;
  if (payload.appointmentId) {
    const { data, error } = await db.from("appointments").select("workspace_id").eq("id", payload.appointmentId).single();
    if (error) throw error;
    return data.workspace_id;
  }
  if (payload.serviceId) {
    const { data, error } = await db.from("service_records").select("workspace_id").eq("id", payload.serviceId).single();
    if (error) throw error;
    return data.workspace_id;
  }
  if (payload.vehicleId) {
    const { data, error } = await db.from("vehicles").select("workspace_id").eq("id", payload.vehicleId).single();
    if (error) throw error;
    return data.workspace_id;
  }
  throw new Error("Inspection must be associated with an appointment, service record, or vehicle.");
}

export async function saveInspection(payload: PerformInspectionPayload): Promise<void> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");
  const workspaceId = await resolveInspectionWorkspace(payload);
  const db = supabase as any;
  const { data: inspection, error: inspectionError } = await db.from("service_inspections").insert({ workspace_id: workspaceId, user_id: user.id, service_id: payload.serviceId || null, vehicle_id: payload.vehicleId || null, appointment_id: payload.appointmentId || null, template_id: payload.templateId, template_name: payload.templateName, inspector_name: payload.inspectorName || null, notes: payload.notes || null, status: "completed" }).select().single();
  if (inspectionError) throw inspectionError;

  const resultRecords = Object.values(payload.results).map((result) => ({ workspace_id: workspaceId, inspection_id: inspection.id, item_name: result.item_name, item_category: result.item_category, status: result.status, notes: result.notes || null, sort_order: result.sort_order }));
  if (resultRecords.length > 0) {
    const { error: resultsError } = await db.from("inspection_results").insert(resultRecords);
    if (resultsError) throw resultsError;
  }
}

export interface InspectionTemplateOption { id: string; name: string; description: string | null; category: string; }
export interface InspectionItemOption { id: string; template_id: string; name: string; description: string | null; category: string | null; is_required: boolean; sort_order: number; }
export interface PastInspection { id: string; template_name: string; inspector_name: string | null; inspection_date: string; notes: string | null; status: string; }

export async function fetchInspectionPerformerData(serviceId?: string, vehicleId?: string): Promise<{ templates: InspectionTemplateOption[]; pastInspections: PastInspection[] }> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return { templates: [], pastInspections: [] };
  const db = supabase as any;
  const templatesPromise = db.from("inspection_templates").select("id, name, description, category").eq("user_id", user.id).eq("is_active", true).order("name");
  let pastQuery = db.from("service_inspections").select("id, template_name, inspector_name, inspection_date, notes, status").order("inspection_date", { ascending: false }).limit(5);
  if (serviceId) pastQuery = pastQuery.eq("service_id", serviceId);
  if (vehicleId) pastQuery = pastQuery.eq("vehicle_id", vehicleId);
  const [templatesRes, pastRes] = await Promise.all([templatesPromise, pastQuery]);
  if (templatesRes.error) throw templatesRes.error;
  if (pastRes.error) throw pastRes.error;
  return { templates: (templatesRes.data || []) as InspectionTemplateOption[], pastInspections: (pastRes.data || []) as PastInspection[] };
}

export async function fetchInspectionItems(templateId: string): Promise<InspectionItemOption[]> {
  const { data, error } = await (supabase as any).from("inspection_items").select("*").eq("template_id", templateId).order("sort_order");
  if (error) throw error;
  return (data || []) as InspectionItemOption[];
}

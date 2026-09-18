/**
 * Inspection Performer Commands
 * Handles performing and saving vehicle inspections.
 */
import { supabase } from "@/integrations/supabase/client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { createServiceRecommendation } from "@/application/commands/service-recommendation.command";

export interface InspectionResultData {
  item_name: string;
  item_category: string | null;
  status: string;
  notes: string;
  sort_order: number;
  service_catalog_id?: string | null;
  price?: number | null;
}
export interface PerformInspectionPayload {
  serviceId?: string;
  vehicleId?: string;
  appointmentId?: string;
  templateId: string;
  templateName: string;
  inspectorName?: string;
  notes?: string;
  results: Record<string, InspectionResultData>;
}

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
  if (!payload.appointmentId || !payload.vehicleId) {
    throw new Error("Job-start inspections require appointment and vehicle context.");
  }

  const workspaceId = await resolveInspectionWorkspace(payload);
  const db = supabase as any;
  const { data: existingInspection, error: existingError } = await db.from("service_inspections")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("appointment_id", payload.appointmentId)
    .eq("vehicle_id", payload.vehicleId)
    .eq("template_id", payload.templateId)
    .neq("status", "cancelled")
    .maybeSingle();
  if (existingError) throw existingError;

  let inspection: any;
  if (existingInspection?.id) {
    const { data, error } = await db.from("service_inspections").update({
      user_id: user.id,
      service_id: payload.serviceId || null,
      template_name: payload.templateName,
      inspector_name: payload.inspectorName || null,
      notes: payload.notes || null,
      status: "completed",
      inspection_date: new Date().toISOString(),
    }).eq("id", existingInspection.id).select().single();
    if (error) throw error;
    inspection = data;
    const { error: clearError } = await db.from("inspection_results").delete().eq("inspection_id", inspection.id);
    if (clearError) throw clearError;
  } else {
    const { data, error } = await db.from("service_inspections").insert({
      workspace_id: workspaceId,
      user_id: user.id,
      service_id: payload.serviceId || null,
      vehicle_id: payload.vehicleId,
      appointment_id: payload.appointmentId,
      template_id: payload.templateId,
      template_name: payload.templateName,
      inspector_name: payload.inspectorName || null,
      notes: payload.notes || null,
      status: "completed",
    }).select().single();
    if (error) throw error;
    inspection = data;
  }

  const source = Object.values(payload.results);
  const resultRecords = source.map((result) => ({
    workspace_id: workspaceId,
    inspection_id: inspection.id,
    item_name: result.item_name,
    item_category: result.item_category,
    status: result.status,
    notes: result.notes || null,
    sort_order: result.sort_order,
  }));

  let inserted: any[] = [];
  if (resultRecords.length) {
    const { data, error } = await db.from("inspection_results").insert(resultRecords).select();
    if (error) throw error;
    inserted = data || [];
  }

  // A condition finding and a sellable recommendation are different records.
  // Preserve every finding, but only create a customer-authorizable recommendation
  // after the technician has selected a real catalog service. This prevents an
  // Attention/Urgent finding from becoming a $0/unknown appointment service.
  for (let i = 0; i < inserted.length; i++) {
    const status = String(inserted[i].status || "").toLowerCase();
    if (status !== "attention" && status !== "urgent") continue;
    const original = source[i];
    if (!original.service_catalog_id) continue;

    await createServiceRecommendation({
      workspaceId,
      appointmentId: payload.appointmentId,
      vehicleId: payload.vehicleId,
      inspectionId: inspection.id,
      inspectionResultId: inserted[i].id,
      serviceCatalogId: original.service_catalog_id,
      description: original.item_name,
      technicianNotes: original.notes || null,
      price: original.price ?? null,
    });
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

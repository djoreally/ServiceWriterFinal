/** Inspections Queries - read operations for templates, items, and vehicle-scoped appointment gates. */
import { supabase } from "@/integrations/supabase/client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";

export interface InspectionTemplate { id: string; name: string; description: string | null; category: string; is_active: boolean; created_at: string; }
export interface InspectionItem { id: string; template_id: string; name: string; description: string | null; category: string | null; is_required: boolean; sort_order: number; }
export interface InspectionTemplateData { templates: InspectionTemplate[]; items: Record<string, InspectionItem[]>; }

export async function fetchInspectionTemplates(): Promise<InspectionTemplateData> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Authentication required");
  const db = supabase as any;
  const { data: templates, error } = await db.from("inspection_templates").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
  if (error) throw error;
  const templateList = templates ?? [];
  let items: Record<string, InspectionItem[]> = {};
  if (templateList.length > 0) {
    const { data: itemsData, error: itemsError } = await db.from("inspection_items").select("*").in("template_id", templateList.map((t: InspectionTemplate) => t.id)).order("sort_order");
    if (itemsError) throw itemsError;
    if (itemsData) items = itemsData.reduce((acc: Record<string, InspectionItem[]>, item: InspectionItem) => { if (!acc[item.template_id]) acc[item.template_id] = []; acc[item.template_id].push(item); return acc; }, {});
  }
  return { templates: templateList, items };
}

export interface AppointmentInspectionRequirement {
  templateId: string;
  templateName: string;
  vehicleId: string | null;
  completed: boolean;
}
export interface AppointmentInspectionGate { required: AppointmentInspectionRequirement[]; pendingCount: number; }

/** Required inspections are scoped to the service's vehicle, not the whole appointment. */
export async function fetchAppointmentInspectionGate(appointmentId: string): Promise<AppointmentInspectionGate> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return { required: [], pendingCount: 0 };
  const db = supabase as any;

  const { data: appt, error: apptError } = await db.from("appointments").select("id, workspace_id, vehicle_id").eq("id", appointmentId).maybeSingle();
  if (apptError) throw apptError;
  if (!appt) return { required: [], pendingCount: 0 };

  const { data: appointmentItems, error: itemsError } = await db.from("appointment_items").select("service_catalog_id, metadata").eq("workspace_id", appt.workspace_id).eq("appointment_id", appointmentId);
  if (itemsError) throw itemsError;
  const catalogIds = Array.from(new Set<string>((appointmentItems ?? []).map((row: any) => row.service_catalog_id).filter(Boolean)));
  if (catalogIds.length === 0) return { required: [], pendingCount: 0 };

  const { data: catalogRows, error: catalogError } = await db.from("service_catalog").select("id, name, inspection_template_id").eq("workspace_id", appt.workspace_id).in("id", catalogIds).not("inspection_template_id", "is", null);
  if (catalogError) throw catalogError;
  const catalogById = new Map<string, any>((catalogRows ?? []).map((row: any) => [row.id, row]));

  const required: { templateId: string; templateName: string; vehicleId: string | null }[] = [];
  const seen = new Set<string>();
  for (const item of appointmentItems ?? []) {
    const catalog = catalogById.get(item.service_catalog_id);
    const templateId = catalog?.inspection_template_id as string | null | undefined;
    if (!templateId) continue;
    const metadataVehicleId = typeof item.metadata?.vehicle_id === "string" && item.metadata.vehicle_id ? item.metadata.vehicle_id : null;
    const vehicleId = metadataVehicleId ?? appt.vehicle_id ?? null;
    const key = `${templateId}:${vehicleId ?? "none"}`;
    if (seen.has(key)) continue;
    required.push({ templateId, templateName: catalog.name, vehicleId });
    seen.add(key);
  }
  if (required.length === 0) return { required: [], pendingCount: 0 };

  const { data: completed, error: completedError } = await db.from("service_inspections").select("template_id, vehicle_id").eq("workspace_id", appt.workspace_id).eq("appointment_id", appointmentId).eq("status", "completed");
  if (completedError) throw completedError;
  const completedPairs = new Set<string>((completed ?? []).map((row: any) => `${row.template_id}:${row.vehicle_id ?? "none"}`));
  const out = required.map((r) => ({ ...r, completed: completedPairs.has(`${r.templateId}:${r.vehicleId ?? "none"}`) }));
  return { required: out, pendingCount: out.filter((r) => !r.completed).length };
}

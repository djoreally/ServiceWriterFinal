/**
 * Inspections Queries - Read operations for inspection templates and items.
 */

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

export interface AppointmentInspectionGate { required: { templateId: string; templateName: string; completed: boolean }[]; pendingCount: number; }

/** Canonical workspace-scoped inspection gate. Appointment services come from appointment_items. */
export async function fetchAppointmentInspectionGate(appointmentId: string): Promise<AppointmentInspectionGate> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return { required: [], pendingCount: 0 };
  const db = supabase as any;

  const { data: appt, error: apptError } = await db.from("appointments").select("id, workspace_id").eq("id", appointmentId).maybeSingle();
  if (apptError) throw apptError;
  if (!appt) return { required: [], pendingCount: 0 };

  const { data: appointmentItems, error: itemsError } = await db.from("appointment_items").select("service_catalog_id, description").eq("workspace_id", appt.workspace_id).eq("appointment_id", appointmentId);
  if (itemsError) throw itemsError;
  const catalogIds = Array.from(new Set<string>((appointmentItems ?? []).map((row: any) => row.service_catalog_id).filter(Boolean)));
  if (catalogIds.length === 0) return { required: [], pendingCount: 0 };

  const { data: catalogRows, error: catalogError } = await db.from("service_catalog").select("id, name, inspection_template_id").eq("workspace_id", appt.workspace_id).in("id", catalogIds).not("inspection_template_id", "is", null);
  if (catalogError) throw catalogError;

  const required: { templateId: string; templateName: string }[] = [];
  const seen = new Set<string>();
  for (const row of catalogRows ?? []) {
    const templateId = row.inspection_template_id as string | null;
    if (!templateId || seen.has(templateId)) continue;
    required.push({ templateId, templateName: row.name });
    seen.add(templateId);
  }
  if (required.length === 0) return { required: [], pendingCount: 0 };

  const { data: completed, error: completedError } = await db.from("service_inspections").select("template_id").eq("workspace_id", appt.workspace_id).eq("appointment_id", appointmentId).eq("status", "completed");
  if (completedError) throw completedError;
  const completedTemplates = new Set<string>((completed ?? []).map((row: any) => row.template_id));
  const out = required.map((r) => ({ ...r, completed: completedTemplates.has(r.templateId) }));
  return { required: out, pendingCount: out.filter((r) => !r.completed).length };
}

/**
 * Inspections Queries - Read operations for inspection templates and items.
 */

import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface InspectionTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string;
  is_active: boolean;
  created_at: string;
}

export interface InspectionItem {
  id: string;
  template_id: string;
  name: string;
  description: string | null;
  category: string | null;
  is_required: boolean;
  sort_order: number;
}

export interface InspectionTemplateData {
  templates: InspectionTemplate[];
  items: Record<string, InspectionItem[]>;
}

export async function fetchInspectionTemplates(): Promise<InspectionTemplateData> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Authentication required");

  const { data: templates, error } = await supabase
    .from("inspection_templates")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const templateList = templates ?? [];
  let items: Record<string, InspectionItem[]> = {};

  // Fetch items for all templates in one query
  if (templateList.length > 0) {
    const { data: itemsData } = await supabase
      .from("inspection_items")
      .select("*")
      .in("template_id", templateList.map((t) => t.id))
      .order("sort_order");

    if (itemsData) {
      items = itemsData.reduce((acc, item) => {
        if (!acc[item.template_id]) acc[item.template_id] = [];
        acc[item.template_id].push(item);
        return acc;
      }, {} as Record<string, InspectionItem[]>);
    }
  }

  return { templates: templateList, items };
}

export interface AppointmentInspectionGate {
  required: { templateId: string; templateName: string; completed: boolean }[];
  pendingCount: number;
}

/**
 * Return the inspection gate status for an appointment: every inspection
 * template linked (via service_catalog.inspection_template_id) to either the
 * appointment's primary catalog item or any of its appointment_services rows,
 * and whether a matching service_inspections row already exists for this
 * appointment.
 */
export async function fetchAppointmentInspectionGate(
  appointmentId: string,
): Promise<AppointmentInspectionGate> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return { required: [], pendingCount: 0 };

  // 1. Appointment + linked services
  const { data: appt } = await supabase
    .from("appointments")
    .select("id, service_catalog_id")
    .eq("id", appointmentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!appt) return { required: [], pendingCount: 0 };

  const { data: apptSvcs } = await supabase
    .from("appointment_services")
    .select("name")
    .eq("appointment_id", appointmentId);

  const names = (apptSvcs ?? []).map((r: any) => r.name).filter(Boolean);

  // 2. Catalog rows with an inspection template (by id OR matching service name)
  const ids: string[] = [];
  if (appt.service_catalog_id) ids.push(appt.service_catalog_id);

  const catalogQuery = supabase
    .from("service_catalog")
    .select("id, name, inspection_template_id")
    .eq("user_id", user.id)
    .not("inspection_template_id", "is", null);

  // pull rows for the appointment catalog id OR for any line-item name
  const { data: catalogRows } = await catalogQuery;

  const required: { templateId: string; templateName: string }[] = [];
  const seen = new Set<string>();
  for (const row of (catalogRows ?? []) as any[]) {
    const tid = row.inspection_template_id;
    if (!tid || seen.has(tid)) continue;
    if (ids.includes(row.id) || names.includes(row.name)) {
      required.push({ templateId: tid, templateName: row.name });
      seen.add(tid);
    }
  }

  if (required.length === 0) {
    return { required: [], pendingCount: 0 };
  }

  // 3. Fetch saved service_inspections for this appointment
  const { data: completed } = await supabase
    .from("service_inspections")
    .select("template_id")
    .eq("user_id", user.id)
    .eq("appointment_id", appointmentId as any);

  const completedTemplates = new Set((completed ?? []).map((r: any) => r.template_id));

  const out = required.map((r) => ({
    ...r,
    completed: completedTemplates.has(r.templateId),
  }));

  return {
    required: out,
    pendingCount: out.filter((r) => !r.completed).length,
  };
}

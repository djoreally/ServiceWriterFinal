/**
 * Inspection Performer Commands
 * Handles performing and saving vehicle inspections.
 */

import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface InspectionResultData {
  item_name: string;
  item_category: string | null;
  status: string;
  notes: string;
  sort_order: number;
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

export async function saveInspection(payload: PerformInspectionPayload): Promise<void> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");

  const { data: inspection, error: inspectionError } = await supabase
    .from("service_inspections")
    .insert({
      user_id: user.id,
      service_id: payload.serviceId || null,
      vehicle_id: payload.vehicleId || null,
      appointment_id: payload.appointmentId || null,
      template_id: payload.templateId,
      template_name: payload.templateName,
      inspector_name: payload.inspectorName || null,
      notes: payload.notes || null,
      status: "completed",
    } as any)
    .select()
    .single();

  if (inspectionError) throw inspectionError;

  const resultRecords = Object.entries(payload.results).map(([, result]) => ({
    inspection_id: inspection.id,
    item_name: result.item_name,
    item_category: result.item_category,
    status: result.status,
    notes: result.notes || null,
    sort_order: result.sort_order,
  }));

  const { error: resultsError } = await supabase.from("inspection_results").insert(resultRecords);
  if (resultsError) throw resultsError;
}

export interface InspectionTemplateOption {
  id: string;
  name: string;
  description: string | null;
  category: string;
}

export interface InspectionItemOption {
  id: string;
  template_id: string;
  name: string;
  description: string | null;
  category: string | null;
  is_required: boolean;
  sort_order: number;
}

export interface PastInspection {
  id: string;
  template_name: string;
  inspector_name: string | null;
  inspection_date: string;
  notes: string | null;
  status: string;
}

export async function fetchInspectionPerformerData(serviceId?: string, vehicleId?: string): Promise<{
  templates: InspectionTemplateOption[];
  pastInspections: PastInspection[];
}> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return { templates: [], pastInspections: [] };

  const templatesPromise = supabase
    .from("inspection_templates")
    .select("id, name, description, category")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("name");

  let pastQuery = supabase
    .from("service_inspections")
    .select("id, template_name, inspector_name, inspection_date, notes, status")
    .eq("user_id", user.id)
    .order("inspection_date", { ascending: false })
    .limit(5);

  if (serviceId) pastQuery = pastQuery.eq("service_id", serviceId);
  if (vehicleId) pastQuery = pastQuery.eq("vehicle_id", vehicleId);

  const [templatesRes, pastRes] = await Promise.all([templatesPromise, pastQuery]);

  return {
    templates: (templatesRes.data || []) as unknown as InspectionTemplateOption[],
    pastInspections: (pastRes.data || []) as unknown as PastInspection[],
  };
}

export async function fetchInspectionItems(templateId: string): Promise<InspectionItemOption[]> {
  const { data } = await supabase
    .from("inspection_items")
    .select("*")
    .eq("template_id", templateId)
    .order("sort_order");

  return (data || []) as unknown as InspectionItemOption[];
}

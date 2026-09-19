import { supabase } from "@/integrations/supabase/client";

export type RecommendationDecision = "approved" | "declined";
export type RecommendationWorkResolution = "completed" | "unable_to_complete";

export async function createServiceRecommendation(input: {
  workspaceId: string; appointmentId: string; vehicleId: string; inspectionId: string;
  inspectionResultId?: string | null; serviceCatalogId?: string | null;
  description: string; technicianNotes?: string | null; price?: number | null;
}) {
  const db = supabase as any;
  if (input.inspectionResultId && input.serviceCatalogId) {
    const { data: existing, error: existingError } = await db.from("service_recommendations")
      .select("*")
      .eq("workspace_id", input.workspaceId)
      .eq("inspection_result_id", input.inspectionResultId)
      .eq("service_catalog_id", input.serviceCatalogId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return existing;
  }

  const { data, error } = await db.from("service_recommendations").insert({
    workspace_id: input.workspaceId, appointment_id: input.appointmentId, vehicle_id: input.vehicleId,
    inspection_id: input.inspectionId, inspection_result_id: input.inspectionResultId ?? null,
    service_catalog_id: input.serviceCatalogId ?? null, description: input.description,
    technician_notes: input.technicianNotes ?? null, price: input.price ?? null, status: "pending",
  }).select().single();
  if (error) throw error;
  return data;
}

export async function decideServiceRecommendation(recommendationId: string, decision: RecommendationDecision) {
  const { data, error } = await (supabase as any).rpc("decide_service_recommendation_v1", {
    p_recommendation_id: recommendationId, p_decision: decision,
  });
  if (error) throw error;
  return data;
}

export async function resolveApprovedRecommendation(
  recommendationId: string,
  resolution: RecommendationWorkResolution,
  notes?: string | null,
) {
  const { data, error } = await (supabase as any).rpc("resolve_service_recommendation_work_v1", {
    p_recommendation_id: recommendationId,
    p_resolution: resolution,
    p_notes: notes?.trim() || null,
  });
  if (error) throw error;
  return data;
}

export async function fetchAppointmentRecommendations(appointmentId: string) {
  const { data, error } = await (supabase as any).from("service_recommendations")
    .select("*, vehicles!service_recommendations_vehicle_id_fkey(year,make,model)")
    .eq("appointment_id", appointmentId).order("created_at");
  if (error) throw error;
  return (data ?? []).map((row: any) => {
    const vehicle = Array.isArray(row.vehicles) ? row.vehicles[0] : row.vehicles;
    return {
      ...row,
      vehicle_description: vehicle
        ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")
        : null,
    };
  });
}

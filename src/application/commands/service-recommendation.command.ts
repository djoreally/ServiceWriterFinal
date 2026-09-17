import { supabase } from "@/integrations/supabase/client";

export type RecommendationDecision = "approved" | "declined";

export async function createServiceRecommendation(input: {
  workspaceId: string; appointmentId: string; vehicleId: string; inspectionId: string;
  inspectionResultId?: string | null; serviceCatalogId?: string | null;
  description: string; technicianNotes?: string | null; price?: number | null;
}) {
  const { data, error } = await (supabase as any).from("service_recommendations").insert({
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

export async function fetchAppointmentRecommendations(appointmentId: string) {
  const { data, error } = await (supabase as any).from("service_recommendations")
    .select("*").eq("appointment_id", appointmentId).order("created_at");
  if (error) throw error;
  return data ?? [];
}

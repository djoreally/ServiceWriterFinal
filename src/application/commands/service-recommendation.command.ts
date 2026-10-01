/**
 * Service Recommendation Commands.
 *
 * Phase 2: all data access goes through the typed API client
 * (`@/lib/api-client`) to the documents Hono router. Exported signatures
 * are unchanged.
 */
import { apiClient } from "@/lib/api-client";

export type RecommendationDecision = "approved" | "declined";

export async function createServiceRecommendation(input: {
  workspaceId: string; appointmentId: string; vehicleId: string; inspectionId: string;
  inspectionResultId?: string | null; serviceCatalogId?: string | null;
  description: string; technicianNotes?: string | null; price?: number | null;
}) {
  const response = await apiClient.post<{ data: unknown }>(`/v1/service-recommendations`, {
    workspace_id: input.workspaceId, appointment_id: input.appointmentId, vehicle_id: input.vehicleId,
    inspection_id: input.inspectionId, inspection_result_id: input.inspectionResultId ?? null,
    service_catalog_id: input.serviceCatalogId ?? null, description: input.description,
    technician_notes: input.technicianNotes ?? null, price: input.price ?? null,
  });
  return response.data;
}

export async function decideServiceRecommendation(recommendationId: string, decision: RecommendationDecision) {
  // The server resolves the workspace from the recommendation row itself,
  // so the client never supplies it for authorization.
  const response = await apiClient.post<{ data: unknown }>(
    `/v1/service-recommendations/${encodeURIComponent(recommendationId)}/decide`,
    { decision },
  );
  return response.data;
}

export async function fetchAppointmentRecommendations(appointmentId: string) {
  const response = await apiClient.get<{ data: unknown[] }>(`/v1/service-recommendations`, {
    query: { appointment_id: appointmentId },
  });
  return response.data ?? [];
}

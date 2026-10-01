/**
 * Declined Services Commands — Write operations for declined service tracking.
 *
 * Phase 2: all data access goes through the typed API client
 * (`@/lib/api-client`) to the documents Hono router. The server resolves the
 * workspace from the auth token; exported signatures are unchanged.
 */
import { apiClient } from "@/lib/api-client";
import type { DeclinedServiceRow } from "@/application/queries/declined-services.query";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";

function currentWorkspace(): string {
  const workspaceId = getSelectedWorkspaceId();
  if (!workspaceId) throw new Error("Select a workspace before working with declined services.");
  return workspaceId;
}

export interface TrackDeclinedServicePayload {
  customer_id: string;
  vehicle_id: string | null;
  recommended_service: string;
  catalog_item_id: string | null;
  estimated_cost: number;
  urgency: string;
  decline_reason: string | null;
  decline_notes: string | null;
  appointment_id?: string | null;
}

export async function trackDeclinedService(payload: TrackDeclinedServicePayload): Promise<void> {
  await apiClient.post<{ data: null }>("/v1/declined-services/track", {
    workspace_id: currentWorkspace(),
    customer_id: payload.customer_id,
    vehicle_id: payload.vehicle_id,
    recommended_service: payload.recommended_service,
    catalog_item_id: payload.catalog_item_id,
    estimated_cost: payload.estimated_cost,
    urgency: payload.urgency,
    decline_reason: payload.decline_reason,
    decline_notes: payload.decline_notes,
    appointment_id: payload.appointment_id ?? null,
  });
}

export async function sendDeclinedServiceFollowUp(service: DeclinedServiceRow): Promise<void> {
  await apiClient.post<{ data: null }>(
    `/v1/declined-services/${encodeURIComponent(service.id)}/follow-up`,
    {
      workspace_id: currentWorkspace(),
      customer_id: service.customer_id,
      customer_email: service.customer_email ?? null,
      customer_name: service.customer_name ?? null,
      recommended_service: service.recommended_service,
      estimated_cost: service.estimated_cost,
      urgency: service.urgency,
    },
  );
}

export async function markDeclinedServiceConverted(serviceId: string): Promise<void> {
  await apiClient.post<{ data: null }>(
    `/v1/declined-services/${encodeURIComponent(serviceId)}/convert`,
    { workspace_id: currentWorkspace() },
  );
}

import { apiClient } from "@/lib/api-client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export type FleetRequestStatus = "new" | "triage" | "waiting_customer" | "waiting_approval" | "waiting_po" | "ready_to_schedule" | "scheduled" | "converted" | "declined" | "duplicate" | "closed";
export type FleetRequestPriority = "routine" | "high" | "urgent" | "safety";
export type FleetRequestSource = "manual" | "email" | "website_form" | "customer_portal" | "ai_agent" | "api" | "import" | "internal" | "pm_automation" | "recurring";

export interface FleetServiceRequest {
  id: string; user_id: string; source_type: FleetRequestSource; status: FleetRequestStatus; priority: FleetRequestPriority;
  subject: string; request_summary: string | null; requester_name: string | null; requester_email: string | null;
  received_at: string; sla_due_at: string | null; assigned_to: string | null; claimed_at: string | null;
  fleet_client_id: string | null; fleet_contact_id: string | null; fleet_location_id: string | null; fleet_vehicle_id: string | null;
  match_status: "unmatched" | "suggested" | "confirmed" | "rejected"; version: number; work_order_draft_id: string | null;
  fleet_clients?: { company_name: string } | null;
  fleet_vehicles?: { unit_number: string | null; year: number | null; make: string | null; model: string | null } | null;
}

export interface FleetDispatchSearchResult {
  entity_type: "client" | "contact" | "location" | "vehicle" | "work_order";
  entity_id: string; title: string; subtitle: string | null; fleet_client_id: string | null; fleet_location_id: string | null; search_rank: number;
}

export async function listFleetServiceRequests(): Promise<FleetServiceRequest[]> {
  const { data } = await apiClient.get<{ data: FleetServiceRequest[] }>("/v1/fleet/service-requests");
  return data ?? [];
}

export async function createFleetServiceRequest(input: { subject: string; request_summary?: string; requester_name?: string; requester_email?: string; priority?: FleetRequestPriority; source_type?: "manual" | "internal" }): Promise<FleetServiceRequest> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("You must be signed in.");
  const { data } = await apiClient.post<{ data: FleetServiceRequest }>("/v1/fleet/service-requests", { input });
  return data as FleetServiceRequest;
}

export async function searchFleetDispatch(query: string): Promise<FleetDispatchSearchResult[]> {
  if (query.trim().length < 2) return [];
  const { data } = await apiClient.get<{ data: FleetDispatchSearchResult[] }>(
    `/v1/fleet/dispatch-search?query=${encodeURIComponent(query.trim())}`,
  );
  return data ?? [];
}

export async function claimFleetServiceRequest(request: FleetServiceRequest): Promise<FleetServiceRequest> {
  const { data } = await apiClient.post<{ data: FleetServiceRequest }>(
    `/v1/fleet/service-requests/${request.id}/claim`,
    { version: request.version },
  );
  return data as FleetServiceRequest;
}

export async function updateFleetServiceRequest(request: FleetServiceRequest, patch: Partial<Pick<FleetServiceRequest, "status" | "priority" | "fleet_client_id" | "fleet_location_id" | "fleet_vehicle_id" | "match_status">>): Promise<void> {
  await apiClient.patch(`/v1/fleet/service-requests/${request.id}`, { patch, version: request.version });
}

export async function convertFleetServiceRequestToDraft(request: FleetServiceRequest): Promise<string> {
  const { data } = await apiClient.post<{ data: { id: string } }>(
    `/v1/fleet/service-requests/${request.id}/convert-to-draft`,
    { version: request.version },
  );
  return String(data.id);
}

export function subscribeFleetServiceRequests(onChange: () => void) {
  // Realtime subscriptions are no longer wired to direct Supabase access.
  // Poll the query instead; the returned function unsubscribes (no-op).
  return () => {};
}

export async function createFleetRequestFromEmail(messageId: string, disposition: "service_request" | "non_service" = "service_request"): Promise<string> {
  const { data } = await apiClient.post<{ data: { id: string } }>("/v1/fleet/service-requests/from-email", {
    message_id: messageId,
    disposition,
  });
  return String(data.id);
}

import { supabase } from "@/integrations/supabase/client";

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

const db = supabase as any;

export async function listFleetServiceRequests(): Promise<FleetServiceRequest[]> {
  const { data, error } = await db.from("fleet_service_requests")
    .select("*, fleet_clients(company_name), fleet_vehicles(unit_number,year,make,model)")
    .order("received_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createFleetServiceRequest(input: { subject: string; request_summary?: string; requester_name?: string; requester_email?: string; priority?: FleetRequestPriority; source_type?: "manual" | "internal" }): Promise<FleetServiceRequest> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("You must be signed in.");
  const { data, error } = await db.from("fleet_service_requests").insert({ user_id: user.id, source_type: input.source_type ?? "internal", status: "new", ...input }).select().single();
  if (error) throw error;
  return data;
}

export async function searchFleetDispatch(query: string): Promise<FleetDispatchSearchResult[]> {
  if (query.trim().length < 2) return [];
  const { data, error } = await db.rpc("search_fleet_dispatch_v1", { p_query: query.trim(), p_limit: 30 });
  if (error) throw error;
  return data ?? [];
}

export async function claimFleetServiceRequest(request: FleetServiceRequest): Promise<FleetServiceRequest> {
  const { data, error } = await db.rpc("claim_fleet_service_request_v1", { p_request_id: request.id, p_version: request.version });
  if (error) throw error;
  return data;
}

export async function updateFleetServiceRequest(request: FleetServiceRequest, patch: Partial<Pick<FleetServiceRequest, "status" | "priority" | "fleet_client_id" | "fleet_location_id" | "fleet_vehicle_id" | "match_status">>): Promise<void> {
  const { data, error } = await db.from("fleet_service_requests").update(patch).eq("id", request.id).eq("version", request.version).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("This request changed. Refresh and try again.");
}

export async function convertFleetServiceRequestToDraft(request: FleetServiceRequest): Promise<string> {
  const { data, error } = await db.rpc("convert_fleet_service_request_to_draft_v1", { p_request_id: request.id, p_version: request.version });
  if (error) throw error;
  return String(data);
}

export function subscribeFleetServiceRequests(onChange: () => void) {
  const channel = db.channel("fleet-service-request-queue").on("postgres_changes", { event: "*", schema: "public", table: "fleet_service_requests" }, onChange).subscribe();
  return () => { void db.removeChannel(channel); };
}

export async function createFleetRequestFromEmail(messageId: string, disposition: "service_request" | "non_service" = "service_request"): Promise<string> {
  const { data, error } = await db.rpc("create_fleet_request_from_email_v1", { p_message_id: messageId, p_disposition: disposition });
  if (error) throw error;
  return String(data);
}

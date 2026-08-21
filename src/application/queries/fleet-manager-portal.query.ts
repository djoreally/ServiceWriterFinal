import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;
export type FleetPortalVehicle = { id: string; unit_number: string | null; year: number | null; make: string | null; model: string | null; vin: string | null; license_plate: string | null; mileage: number | null; status: string };
export type FleetPortalRequest = { id: string; subject: string; status: string; priority: string; received_at: string; vehicle_id: string | null };
export type FleetPortalWorkOrder = { id: string; order_number: string | null; status: string; service_type: string | null; scheduled_date: string | null; scheduled_time: string | null; vehicle_id: string; total: number };
export type FleetPortalApproval = { id: string; work_order_id: string; title: string; description: string | null; estimated_cost: number | null; status: string; created_at: string };
export type FleetPortalInvoice = { id: string; invoice_number: string; status: string; issue_date: string; due_date: string | null; total: number; amount_paid: number };
export type FleetManagerPortal = {
  generated_at: string; selected_client_id: string; clients: { id: string; company_name: string }[];
  permissions: { view_vehicles: boolean; view_service_history: boolean; request_service: boolean; manage_vehicles: boolean; download_reports: boolean; approve_work: boolean; receive_invoices: boolean };
  vehicles: FleetPortalVehicle[]; requests: FleetPortalRequest[]; work_orders: FleetPortalWorkOrder[]; approvals: FleetPortalApproval[]; invoices: FleetPortalInvoice[];
  reports: { active_vehicles: number; open_work: number; completed_work: number; outstanding_balance: number };
};

export async function fetchFleetManagerPortal(clientId?: string): Promise<FleetManagerPortal> {
  const { data, error } = await db.rpc("get_fleet_manager_portal_v1", { p_client_id: clientId ?? null });
  if (error) throw error;
  return data as FleetManagerPortal;
}
export async function createFleetPortalRequest(input: { clientId: string; vehicleId?: string; subject: string; summary: string; priority: string }): Promise<string> {
  const { data, error } = await db.rpc("create_fleet_portal_service_request_v1", { p_client_id: input.clientId, p_vehicle_id: input.vehicleId ?? null, p_subject: input.subject, p_summary: input.summary, p_priority: input.priority });
  if (error) throw error;
  return String(data);
}
export async function respondFleetPortalApproval(id: string, status: "approved" | "rejected", notes?: string): Promise<void> {
  const { error } = await db.rpc("respond_fleet_portal_approval_v1", { p_approval_id: id, p_status: status, p_notes: notes ?? null });
  if (error) throw error;
}

/** Quick Service Commands — canonical writes for the QuickService wizard. */
import { nextApi } from "@/lib/nextApiClient";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";

function workspaceId(): string {
  const id = getSelectedWorkspaceId();
  if (!id) throw new Error("Select a workspace before using Quick Service.");
  return id;
}

function splitName(name: string): { first_name: string; last_name: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return { first_name: parts.shift() || "Customer", last_name: parts.join(" ") };
}

function result<T>(promise: Promise<{ data: T }>): Promise<{ data: T | null; error: Error | null }> {
  return promise
    .then((response) => ({ data: response.data, error: null }))
    .catch((error) => ({ data: null, error: error instanceof Error ? error : new Error("Request failed") }));
}

/** Create a canonical customer record. userId is retained for caller compatibility only. */
export async function insertCustomer(_userId: string, data: {
  name: string; email?: string | null; phone?: string | null; address?: string | null; notes?: string | null;
}) {
  const id = workspaceId();
  return result(nextApi.customers.create({
    workspace_id: id,
    ...splitName(data.name),
    email: data.email || undefined,
    phone: data.phone || undefined,
    address: data.address || undefined,
    notes: data.notes || undefined,
  }));
}

/** Create a canonical vehicle record. */
export async function insertVehicle(_userId: string, data: {
  customer_id: string; make: string; model: string; year: number;
  vin?: string | null; license_plate?: string | null; color?: string | null; mileage?: number | null; notes?: string | null;
}) {
  const id = workspaceId();
  return result(nextApi.vehicles.create({ workspace_id: id, ...data }));
}

/** Create a canonical service record. */
export async function insertServiceRecord(_userId: string, data: {
  customer_id: string; vehicle_id: string; service_date: string; service_type: string;
  description: string; parts_used?: string | null; labor_hours?: number | null;
  labor_cost?: number | null; parts_cost?: number | null; total_cost: number;
  status: string; notes?: string | null;
}) {
  const id = workspaceId();
  const response = await result(nextApi.serviceRecords.create({
    workspace_id: id,
    customer_id: data.customer_id,
    vehicle_id: data.vehicle_id,
    status: data.status === "pending" ? "draft" : data.status === "in_progress" ? "in_progress" : "completed",
    work_performed: data.description,
    internal_notes: data.notes || null,
    subtotal: data.total_cost,
    total_amount: data.total_cost,
    metadata: {
      service_date: data.service_date,
      service_type: data.service_type,
      parts_used: data.parts_used || null,
      labor_hours: data.labor_hours ?? null,
      labor_cost: data.labor_cost ?? null,
      parts_cost: data.parts_cost ?? null,
      total_cost: data.total_cost,
      source: "quick_service",
    },
  }));
  return response;
}

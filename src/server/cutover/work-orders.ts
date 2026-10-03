import "server-only";

import { serviceWriterApi } from "@/server/service-writer-api";

export type ApiWorkOrder = Record<string, unknown> & {
  id: string;
  workspaceId: string;
  appointmentId?: string | null;
  customerId: string;
  vehicleId: string;
  status: string;
  assignedTechnicianUserId?: string | null;
  customerConcern?: string | null;
  internalNotes?: string | null;
  metadata?: Record<string, unknown> | null;
  lines?: Array<Record<string, unknown>>;
};

type ApiCustomer = Record<string, unknown> & { id?: string; firstName?: string; lastName?: string; email?: string | null; phone?: string | null };
type ApiVehicle = Record<string, unknown> & { id?: string; year?: number | null; make?: string | null; model?: string | null; vin?: string | null; licensePlate?: string | null };

export function canonicalWorkOrderStatus(status?: string) {
  if (!status) return undefined;
  if (["scheduled", "assigned"].includes(status)) return "open";
  if (["waiting_for_parts", "awaiting_approval"].includes(status)) return "in_progress";
  if (["draft", "open", "in_progress", "ready", "completed", "cancelled"].includes(status)) return status;
  return undefined;
}

export async function legacyWorkOrder(request: Request, workspaceId: string, row: ApiWorkOrder) {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const [customer, vehicle] = await Promise.all([
    serviceWriterApi<ApiCustomer>(request, `/api/v1/workspaces/${workspaceId}/customers/${row.customerId}`).catch(() => null),
    serviceWriterApi<ApiVehicle>(request, `/api/v1/workspaces/${workspaceId}/vehicles/${row.vehicleId}`).catch(() => null),
  ]);
  return {
    ...row,
    workspace_id: row.workspaceId,
    appointment_id: row.appointmentId ?? null,
    customer_id: row.customerId,
    vehicle_id: row.vehicleId,
    status: metadata.legacy_status ?? row.status,
    technician_id: row.assignedTechnicianUserId ?? null,
    priority: metadata.priority ?? "normal",
    complaint: row.customerConcern ?? null,
    diagnosis: metadata.diagnosis ?? null,
    technician_notes: row.internalNotes ?? null,
    tech_notes: row.internalNotes ?? null,
    location_id: metadata.location_id ?? null,
    location_address: metadata.location_address ?? null,
    location_lat: metadata.location_lat ?? null,
    location_lng: metadata.location_lng ?? null,
    van_id: metadata.legacy_van_id ?? null,
    customer_notes: metadata.customer_notes ?? null,
    signature_url: metadata.signature_url ?? null,
    vin_captured: metadata.vin_captured ?? null,
    mileage_captured: row.odometerIn ?? metadata.mileage_captured ?? null,
    started_at: metadata.started_at ?? null,
    completed_at: row.completedAt ?? metadata.completed_at ?? null,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    work_order_items: row.lines ?? [],
    customers: customer ? { id: customer.id, first_name: customer.firstName, last_name: customer.lastName, email: customer.email, phone: customer.phone } : null,
    vehicles: vehicle ? { id: vehicle.id, year: vehicle.year, make: vehicle.make, model: vehicle.model, vin: vehicle.vin, license_plate: vehicle.licensePlate } : null,
  };
}

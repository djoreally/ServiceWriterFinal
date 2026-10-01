/** Service Records Query — canonical reads with a legacy UI adapter. */
import { apiClient } from "@/lib/api-client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface ServiceRecordRow {
  id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  service_date: string;
  service_type: string;
  description: string;
  parts_used: string | null;
  labor_hours: number | null;
  labor_cost: number | null;
  parts_cost: number | null;
  total_cost: number;
  status: string;
  notes: string | null;
  technician: string | null;
}

interface CustomerRef {
  id: string;
  name: string;
}

interface VehicleRef {
  id: string;
  customer_id: string | null;
  make: string;
  model: string;
  year: number;
}

export interface ServiceRecordsPageData {
  services: ServiceRecordRow[];
  customers: CustomerRef[];
  vehicles: VehicleRef[];
  userId: string;
}

interface RawServiceRow {
  id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  status: string;
  work_performed: string | null;
  customer_notes: string | null;
  internal_notes: string | null;
  metadata: unknown;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  subtotal: number | null;
  total_amount: number | null;
  technician_id: string | null;
}

interface RawCustomerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

interface RawVehicleRow {
  id: string;
  customer_id: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
}

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function customerName(row: { first_name: string | null; last_name: string | null }): string {
  return [row?.first_name, row?.last_name].filter(Boolean).join(" ").trim() || "Customer";
}

export async function fetchServiceRecordsPageData(): Promise<ServiceRecordsPageData | null> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return null;
  const context = await resolveCurrentWorkspace();
  if (!context) return null;

  const { data } = await apiClient.get<{
    data: {
      services: RawServiceRow[];
      customers: RawCustomerRow[];
      vehicles: RawVehicleRow[];
      userId: string;
    } | null;
  }>(`/v1/service-records/page?selected_workspace_id=${encodeURIComponent(context.workspaceId)}`);
  if (!data) return null;

  const services: ServiceRecordRow[] = (data.services ?? []).map((row) => {
    const metadata = object(row.metadata);
    const serviceDate = row.completed_at ?? row.started_at ?? row.created_at;
    return {
      id: row.id,
      customer_id: row.customer_id ?? null,
      vehicle_id: row.vehicle_id ?? null,
      service_date: serviceDate?.slice(0, 10) ?? "",
      service_type: String(metadata.service_type ?? metadata.title ?? row.work_performed ?? "Service"),
      description: row.work_performed ?? String(metadata.description ?? ""),
      parts_used: metadata.parts_used != null ? String(metadata.parts_used) : null,
      labor_hours: metadata.labor_hours != null ? Number(metadata.labor_hours) : null,
      labor_cost: metadata.labor_cost != null ? Number(metadata.labor_cost) : null,
      parts_cost: metadata.parts_cost != null ? Number(metadata.parts_cost) : null,
      total_cost: Number(row.total_amount ?? row.subtotal ?? 0),
      status: row.status,
      notes: row.customer_notes ?? row.internal_notes ?? (metadata.notes != null ? String(metadata.notes) : null),
      technician: typeof metadata.technician === "string"
        ? metadata.technician
        : (typeof metadata.technician_name === "string" ? metadata.technician_name : null),
    };
  });

  return {
    services,
    customers: (data.customers ?? []).map((row) => ({ id: row.id, name: customerName(row) })),
    vehicles: (data.vehicles ?? []).map((row) => ({
      id: row.id,
      customer_id: row.customer_id ?? null,
      make: row.make ?? "",
      model: row.model ?? "",
      year: Number(row.year ?? 0),
    })),
    userId: data.userId,
  };
}

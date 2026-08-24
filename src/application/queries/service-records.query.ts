/** Service Records Query — canonical reads with a legacy UI adapter. */
import { supabase } from "@/integrations/supabase/client";
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

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function customerName(row: any): string {
  return [row?.first_name, row?.last_name].filter(Boolean).join(" ").trim() || "Customer";
}

export async function fetchServiceRecordsPageData(): Promise<ServiceRecordsPageData | null> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return null;
  const context = await resolveCurrentWorkspace();
  if (!context) return null;

  const [servicesRes, customersRes, vehiclesRes] = await Promise.all([
    (supabase.from("service_records") as any)
      .select("id,customer_id,vehicle_id,status,work_performed,customer_notes,internal_notes,metadata,started_at,completed_at,created_at,subtotal,total_amount,technician_id,profiles!service_records_technician_id_fkey(display_name)")
      .eq("workspace_id", context.workspaceId)
      .neq("status", "voided")
      .order("completed_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    (supabase.from("customers") as any)
      .select("id,first_name,last_name")
      .eq("workspace_id", context.workspaceId)
      .neq("status", "archived")
      .order("last_name"),
    (supabase.from("vehicles") as any)
      .select("id,customer_id,make,model,year")
      .eq("workspace_id", context.workspaceId)
      .neq("status", "archived")
      .order("created_at", { ascending: false }),
  ]);

  if (servicesRes.error) throw servicesRes.error;
  if (customersRes.error) throw customersRes.error;
  if (vehiclesRes.error) throw vehiclesRes.error;

  const services: ServiceRecordRow[] = ((servicesRes.data ?? []) as any[]).map((row) => {
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
      technician: row.profiles?.display_name ?? null,
    };
  });

  return {
    services,
    customers: ((customersRes.data ?? []) as any[]).map((row) => ({ id: row.id, name: customerName(row) })),
    vehicles: ((vehiclesRes.data ?? []) as any[]).map((row) => ({
      id: row.id,
      customer_id: row.customer_id ?? null,
      make: row.make ?? "",
      model: row.model ?? "",
      year: Number(row.year ?? 0),
    })),
    userId: user.id,
  };
}

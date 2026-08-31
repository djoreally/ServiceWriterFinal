/** Work Order Queries — canonical workspace-scoped data with legacy UI adapters. */
import { productionSupabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types.production";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

type WorkOrderRow = Database["public"]["Tables"]["work_orders"]["Row"];
type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];
type VehicleRow = Database["public"]["Tables"]["vehicles"]["Row"];
type WorkOrderStatus = Database["public"]["Enums"]["work_order_status"];

interface WorkOrderAppointmentSource {
  id: string;
  starts_at: string;
  metadata: unknown;
}

interface WorkOrderAssignmentSource {
  user_id: string;
  assigned_at: string;
  unassigned_at: string | null;
  profiles: { display_name: string | null } | null;
}

interface WorkOrderSource extends WorkOrderRow {
  customers: CustomerRow | null;
  vehicles: VehicleRow | null;
  appointments?: WorkOrderAppointmentSource | null;
  work_order_assignments: WorkOrderAssignmentSource[];
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function customerAdapter(row: CustomerRow | null) {
  if (!row) return null;
  return {
    ...row,
    name: [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || row.company_name || "Customer",
    address: [row.address_line1, row.address_line2, row.city, row.region, row.postal_code].filter(Boolean).join(", "),
  };
}

function appointmentAdapter(row: WorkOrderAppointmentSource | null | undefined) {
  if (!row) return null;
  const metadata = object(row.metadata);
  const start = row.starts_at ? new Date(row.starts_at) : null;
  return {
    id: row.id,
    title: String(metadata.title ?? metadata.service_name ?? "Appointment"),
    scheduled_date: start && !Number.isNaN(start.getTime()) ? start.toISOString().slice(0, 10) : "",
    scheduled_time: start && !Number.isNaN(start.getTime()) ? start.toISOString().slice(11, 16) : "",
  };
}

function assignmentTechnician(assignments: WorkOrderAssignmentSource[]): { id: string; name: string; email: null } | null {
  const active = (assignments || []).find((assignment) => !assignment.unassigned_at) ?? assignments?.[0];
  if (!active) return null;
  return {
    id: active.user_id,
    name: active.profiles?.display_name ?? "Technician",
    email: null,
  };
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function adaptWorkOrder(row: WorkOrderSource) {
  const metadata = object(row.metadata);
  const technician = assignmentTechnician(row.work_order_assignments ?? []);
  return {
    ...row,
    customers: customerAdapter(row.customers),
    vehicles: row.vehicles ?? null,
    technicians: technician,
    technician_id: technician?.id ?? null,
    vans: null,
    van_id: optionalString(metadata.legacy_van_id),
    location_address: optionalString(metadata.location_address),
    customer_notes: optionalString(metadata.customer_notes),
    signature_url: optionalString(metadata.signature_url),
    vin_captured: optionalString(metadata.vin_captured),
    mileage_captured: optionalNumber(metadata.mileage_captured),
    started_at: optionalString(metadata.started_at),
    tech_notes: optionalString(metadata.tech_notes) ?? row.technician_notes,
    appointments: appointmentAdapter(row.appointments),
  };
}

/** Fetch all work orders in the current workspace. userId is retained for caller compatibility only. */
export async function fetchWorkOrders(_userId: string, filters?: {
  status?: WorkOrderStatus;
  technicianId?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  try {
    const context = await resolveCurrentWorkspace();
    if (!context) return { data: [], error: null };
    let query = productionSupabase.from("work_orders")
      .select("*,customers(*),vehicles(*),locations(*),appointments(id,starts_at,metadata),work_order_assignments(user_id,assigned_at,unassigned_at,profiles!work_order_assignments_user_id_fkey(display_name))")
      .eq("workspace_id", context.workspaceId)
      .order("created_at", { ascending: false });
    if (filters?.status) query = query.eq("status", filters.status);
    if (filters?.dateFrom) query = query.gte("created_at", filters.dateFrom);
    if (filters?.dateTo) query = query.lte("created_at", filters.dateTo);
    const { data, error } = await query;
    if (error) return { data: null, error };
    let rows = (data ?? []).map(adaptWorkOrder);
    if (filters?.technicianId) rows = rows.filter((row) => row.technician_id === filters.technicianId);
    return { data: rows, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error("Failed to load work orders") };
  }
}

/** Fetch a single work order. Legacy checklist is intentionally empty until rebuilt on Final. */
export async function fetchWorkOrderDetail(workOrderId: string) {
  const context = await resolveCurrentWorkspace();
  if (!context) return { workOrder: null, workOrderError: null, checklist: [], checklistError: null };
  const { data, error } = await productionSupabase.from("work_orders")
    .select("*,customers(*),vehicles(*),locations(*),appointments(id,starts_at,metadata),work_order_items(*),work_order_assignments(user_id,assigned_at,unassigned_at,profiles!work_order_assignments_user_id_fkey(display_name)),work_order_events(*)")
    .eq("workspace_id", context.workspaceId)
    .eq("id", workOrderId)
    .single();
  return {
    workOrder: data ? adaptWorkOrder(data) : null,
    workOrderError: error,
    checklist: [],
    checklistError: null,
  };
}

/** Fetch work orders assigned to a current-workspace technician. */
export async function fetchTechnicianWorkOrders(technicianId: string) {
  try {
    const context = await resolveCurrentWorkspace();
    if (!context) return { data: [], error: null };
    const { data, error } = await productionSupabase.from("work_orders")
      .select("*,customers(*),vehicles(*),work_order_assignments!inner(user_id,assigned_at,unassigned_at,profiles!work_order_assignments_user_id_fkey(display_name))")
      .eq("workspace_id", context.workspaceId)
      .eq("work_order_assignments.user_id", technicianId)
      .is("work_order_assignments.unassigned_at", null)
      .in("status", ["assigned", "in_progress", "waiting_for_parts", "awaiting_approval"])
      .order("created_at", { ascending: true });
    return { data: (data ?? []).map((row) => ({ ...adaptWorkOrder(row), work_order_checklist_items: [] })), error };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error("Failed to load technician work orders") };
  }
}

/** Subscribe to workspace-scoped realtime work-order changes. */
export function subscribeWorkOrders(_userId: string, callback: () => void) {
  let channel: ReturnType<typeof productionSupabase.channel> | null = null;
  let cancelled = false;
  void resolveCurrentWorkspace().then((context) => {
    if (!context || cancelled) return;
    channel = productionSupabase
      .channel(`work-orders-realtime-${context.workspaceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "work_orders", filter: `workspace_id=eq.${context.workspaceId}` }, callback)
      .subscribe();
  });
  return {
    channel,
    unsubscribe: () => {
      cancelled = true;
      if (channel) void productionSupabase.removeChannel(channel);
    },
  };
}

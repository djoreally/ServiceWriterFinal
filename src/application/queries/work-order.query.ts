/** Work Order Queries — canonical workspace-scoped data with legacy UI adapters. */
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function customerAdapter(row: any) {
  if (!row) return null;
  return {
    ...row,
    name: [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || row.company_name || "Customer",
    address: [row.address_line1, row.address_line2, row.city, row.region, row.postal_code].filter(Boolean).join(", "),
  };
}

function appointmentAdapter(row: any) {
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

function assignmentTechnician(assignments: any[]): any | null {
  const active = (assignments || []).find((assignment) => !assignment.unassigned_at) ?? assignments?.[0];
  if (!active) return null;
  return {
    id: active.user_id,
    name: active.profiles?.display_name ?? "Technician",
    email: null,
  };
}

function adaptWorkOrder(row: any) {
  const metadata = object(row.metadata);
  return {
    ...row,
    customers: customerAdapter(row.customers),
    vehicles: row.vehicles ?? null,
    technicians: assignmentTechnician(row.work_order_assignments ?? []),
    technician_id: assignmentTechnician(row.work_order_assignments ?? [])?.id ?? null,
    vans: null,
    van_id: metadata.legacy_van_id ?? null,
    location_address: metadata.location_address ?? null,
    customer_notes: metadata.customer_notes ?? null,
    signature_url: metadata.signature_url ?? null,
    vin_captured: metadata.vin_captured ?? null,
    mileage_captured: metadata.mileage_captured ?? null,
    started_at: metadata.started_at ?? null,
    tech_notes: metadata.tech_notes ?? row.technician_notes ?? null,
    appointments: appointmentAdapter(row.appointments),
  };
}

/** Fetch all work orders in the current workspace. userId is retained for caller compatibility only. */
export async function fetchWorkOrders(_userId: string, filters?: {
  status?: string;
  technicianId?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  try {
    const context = await resolveCurrentWorkspace();
    if (!context) return { data: [], error: null };
    let query = (supabase.from("work_orders") as any)
      .select("*,customers(*),vehicles(*),locations(*),appointments(id,starts_at,metadata),work_order_assignments(user_id,assigned_at,unassigned_at,profiles!work_order_assignments_user_id_fkey(display_name))")
      .eq("workspace_id", context.workspaceId)
      .order("created_at", { ascending: false });
    if (filters?.status) query = query.eq("status", filters.status);
    if (filters?.dateFrom) query = query.gte("created_at", filters.dateFrom);
    if (filters?.dateTo) query = query.lte("created_at", filters.dateTo);
    const { data, error } = await query;
    if (error) return { data: null, error };
    let rows = ((data ?? []) as any[]).map(adaptWorkOrder);
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
  const { data, error } = await (supabase.from("work_orders") as any)
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
    const { data, error } = await (supabase.from("work_orders") as any)
      .select("*,customers(*),vehicles(*),work_order_assignments!inner(user_id,assigned_at,unassigned_at,profiles!work_order_assignments_user_id_fkey(display_name))")
      .eq("workspace_id", context.workspaceId)
      .eq("work_order_assignments.user_id", technicianId)
      .is("work_order_assignments.unassigned_at", null)
      .in("status", ["assigned", "in_progress", "waiting_for_parts", "awaiting_approval"])
      .order("created_at", { ascending: true });
    return { data: ((data ?? []) as any[]).map((row) => ({ ...adaptWorkOrder(row), work_order_checklist_items: [] })), error };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error("Failed to load technician work orders") };
  }
}

/** Subscribe to workspace-scoped realtime work-order changes. */
export function subscribeWorkOrders(_userId: string, callback: () => void) {
  let channel: ReturnType<typeof supabase.channel> | null = null;
  let cancelled = false;
  void resolveCurrentWorkspace().then((context) => {
    if (!context || cancelled) return;
    channel = supabase
      .channel(`work-orders-realtime-${context.workspaceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "work_orders", filter: `workspace_id=eq.${context.workspaceId}` }, callback)
      .subscribe();
  });
  return {
    channel,
    unsubscribe: () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    },
  };
}

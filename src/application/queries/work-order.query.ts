/** Work Order Queries — canonical workspace-scoped data with legacy UI adapters. */
import { apiClient } from "@/lib/api-client";
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

const PAGE_SIZE = 100;

/** The Hono list is paginated; the legacy reads were unbounded, so page through. */
async function fetchAllWorkOrderPages(
  workspaceId: string,
  params: Record<string, string | number | undefined>,
): Promise<WorkOrderSource[]> {
  const rows: WorkOrderSource[] = [];
  let offset = 0;
  for (;;) {
    const response = await apiClient.get<{ data: WorkOrderSource[] }>("/v1/work-orders", {
      query: { workspace_id: workspaceId, limit: PAGE_SIZE, offset, ...params },
    });
    const page = response.data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
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
    const rows = (await fetchAllWorkOrderPages(context.workspaceId, {
      status: filters?.status,
      date_from: filters?.dateFrom,
      date_to: filters?.dateTo,
    })).map(adaptWorkOrder);
    const filtered = filters?.technicianId
      ? rows.filter((row) => row.technician_id === filters.technicianId)
      : rows;
    return { data: filtered, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error("Failed to load work orders") };
  }
}

/** Fetch a single work order. Legacy checklist is intentionally empty until rebuilt on Final. */
export async function fetchWorkOrderDetail(workOrderId: string) {
  const context = await resolveCurrentWorkspace();
  if (!context) return { workOrder: null, workOrderError: null, checklist: [], checklistError: null };
  try {
    const response = await apiClient.get<{ data: WorkOrderSource | null }>(
      `/v1/work-orders/${encodeURIComponent(workOrderId)}`,
      { query: { workspace_id: context.workspaceId } },
    );
    return {
      workOrder: response.data ? adaptWorkOrder(response.data) : null,
      workOrderError: null,
      checklist: [],
      checklistError: null,
    };
  } catch (error) {
    return {
      workOrder: null,
      workOrderError: error instanceof Error ? error : new Error("Failed to load work order"),
      checklist: [],
      checklistError: null,
    };
  }
}

/** Fetch work orders assigned to a current-workspace technician. */
export async function fetchTechnicianWorkOrders(technicianId: string) {
  try {
    const context = await resolveCurrentWorkspace();
    if (!context) return { data: [], error: null };
    const rows = await fetchAllWorkOrderPages(context.workspaceId, {
      technician_id: technicianId,
      assignment_statuses: ["assigned", "in_progress", "waiting_for_parts", "awaiting_approval"].join(","),
    });
    // The legacy read ordered oldest-first.
    rows.sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
    return {
      data: rows.map((row) => ({ ...adaptWorkOrder(row), work_order_checklist_items: [] })),
      error: null,
    };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error("Failed to load technician work orders") };
  }
}

const SUBSCRIBE_POLL_MS = 15000;

/**
 * Subscribe to workspace-scoped work-order changes.
 *
 * There is no realtime primitive on the sanctioned API client, so this polls
 * the list endpoint and invokes the callback whenever the newest row's
 * timestamp changes. The exported shape is unchanged.
 */
export function subscribeWorkOrders(_userId: string, callback: () => void) {
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;
  let lastSeen: string | null | undefined;

  const check = async (workspaceId: string) => {
    if (stopped) return;
    try {
      const response = await apiClient.get<{ data: Array<{ updated_at?: string | null; created_at?: string | null }> }>(
        "/v1/work-orders",
        { query: { workspace_id: workspaceId, limit: 1 } },
      );
      const newest = response.data?.[0];
      const stamp = newest?.updated_at ?? newest?.created_at ?? null;
      if (lastSeen === undefined) {
        lastSeen = stamp;
        return;
      }
      if (stamp !== lastSeen) {
        lastSeen = stamp;
        callback();
      }
    } catch {
      // Transient failure — retry on the next tick.
    }
  };

  void resolveCurrentWorkspace().then((context) => {
    if (!context || stopped) return;
    void check(context.workspaceId);
    timer = setInterval(() => { void check(context.workspaceId); }, SUBSCRIBE_POLL_MS);
  });

  return {
    channel: null,
    unsubscribe: () => {
      stopped = true;
      if (timer) clearInterval(timer);
    },
  };
}

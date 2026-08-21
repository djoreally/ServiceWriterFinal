import type { FleetWorkOrderSummary } from "@/application/queries/fleet.query";

/**
 * Fleet job grouping — one Job, N work orders.
 *
 * Replaces the old `groupScheduledFleetWork` heuristic (which relied on a
 * non-existent `created_from` column). Grouping is driven by the real
 * `fleet_work_orders.fleet_job_id` foreign key stamped by
 * `create_fleet_job_for_work_orders_v1` / draft promotion.
 */

const TERMINAL_STATUSES = new Set(["completed", "invoiced", "paid"]);
const CANCELLED_STATUSES = new Set(["cancelled", "canceled"]);
const ACTIVE_STATUSES = new Set(["in_progress", "arrived", "en_route"]);

/** Mirrors the `sync_fleet_job_rollup_v1` trigger in the database. */
export function rollupFleetJobStatus(
  orders: Array<Pick<FleetWorkOrderSummary, "status" | "assigned_technician_id">>,
): string {
  if (orders.length === 0) return "scheduled";
  if (orders.every((order) => CANCELLED_STATUSES.has(order.status))) return "cancelled";
  if (orders.every((order) => TERMINAL_STATUSES.has(order.status) || CANCELLED_STATUSES.has(order.status))) return "completed";
  if (orders.some((order) => ACTIVE_STATUSES.has(order.status))) return "in_progress";
  if (orders.some((order) => order.assigned_technician_id)) return "assigned";
  return "scheduled";
}

export interface FleetJobGroup {
  kind: "job";
  jobId: string;
  jobNumber: string | null;
  orders: FleetWorkOrderSummary[];
  scheduledDate: string | null;
  scheduledTime: string | null;
  technicianId: string | null;
  status: string;
  priority: string;
  total: number;
  serviceType: string;
  clientName: string | null;
  locationName: string | null;
  durationMinutes: number;
  /** Latest child updated_at — used for display and optimistic-concurrency hints. */
  updatedAt: string | null;
}

function orderDurationMinutes(order: FleetWorkOrderSummary): number {
  const minutes = (order as FleetWorkOrderSummary & { scheduled_duration_minutes?: number | null }).scheduled_duration_minutes;
  return Number(minutes || 60);
}

/**
 * Split a work-order list into real job groups (fleet_job_id set) and
 * standalone orders. A job stays a group even if only one child remains
 * visible — the job entity exists and has its own detail page.
 */
export function buildFleetJobGroups(orders: FleetWorkOrderSummary[]): {
  groups: FleetJobGroup[];
  standalone: FleetWorkOrderSummary[];
} {
  const byJob = new Map<string, FleetWorkOrderSummary[]>();
  const standalone: FleetWorkOrderSummary[] = [];

  for (const order of orders) {
    const jobId = order.fleet_job_id;
    if (!jobId) {
      standalone.push(order);
      continue;
    }
    const list = byJob.get(jobId);
    if (list) list.push(order);
    else byJob.set(jobId, [order]);
  }

  const groups: FleetJobGroup[] = [];
  byJob.forEach((items, jobId) => {
    const sortedItems = [...items].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const first = sortedItems[0];
    const times = sortedItems
      .map((order) => order.scheduled_time)
      .filter((time): time is string => Boolean(time))
      .sort();
    const updatedAts = sortedItems.map((order) => order.updated_at).filter(Boolean).sort();

    groups.push({
      kind: "job",
      jobId,
      jobNumber: first.fleet_jobs?.job_number ?? null,
      orders: sortedItems,
      scheduledDate: first.scheduled_date ?? null,
      scheduledTime: times[0] ?? null,
      technicianId: first.assigned_technician_id ?? null,
      status: rollupFleetJobStatus(sortedItems),
      priority: sortedItems.some((order) => order.priority === "urgent")
        ? "urgent"
        : sortedItems.some((order) => order.priority === "high")
          ? "high"
          : "normal",
      total: sortedItems.reduce((sum, order) => sum + Number(order.total || 0), 0),
      serviceType: first.service_type || "Fleet service",
      clientName: first.fleet_clients?.company_name ?? null,
      locationName: first.fleet_locations?.name ?? null,
      durationMinutes: sortedItems.reduce((sum, order) => sum + orderDurationMinutes(order), 0),
      updatedAt: updatedAts[updatedAts.length - 1] ?? null,
    });
  });

  groups.sort((a, b) => String(a.scheduledTime || "23:59").localeCompare(String(b.scheduledTime || "23:59")));
  return { groups, standalone };
}

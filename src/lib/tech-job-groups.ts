/**
 * Tech feed fleet-job grouping — one stop, N vehicles.
 *
 * Fleet work orders stamped with the same `fleet_job_id` collapse into a single
 * representative stop so the mission board, Today schedule, route planner, and
 * Jobs list all treat a multi-vehicle fleet job as ONE destination. The
 * representative carries the visible child list so UIs can expand per-vehicle
 * rows, and the DB-reported vehicle count so "25 vehicles" is right even when
 * only some children are visible in the current window.
 */

const TERMINAL_STATUSES = new Set(["completed", "invoiced", "paid", "closed"]);
const CANCELLED_STATUSES = new Set(["cancelled", "canceled"]);

export interface TechFleetGroupableJob {
  id: string;
  is_fleet?: boolean;
  fleet_job_id?: string | null;
  fleet_job_number?: string | null;
  fleet_vehicle_count?: number | null;
  status?: string | null;
  dispatch_status?: string | null;
  scheduled_time?: string | null;
}

export type TechJobStop<TJob extends TechFleetGroupableJob> = TJob & {
  fleet_job_id: string | null;
  fleet_job_number: string | null;
  fleet_vehicle_count: number | null;
  /** Visible children of the fleet job — only set on group representatives. */
  fleet_children?: TJob[];
};

export function getTechJobEffectiveStatus(job: Pick<TechFleetGroupableJob, "status" | "dispatch_status">): string {
  const status = (job.status ?? "").toLowerCase();
  if (status === "completed") return "completed";
  return (job.dispatch_status || job.status || "scheduled").toLowerCase();
}

/**
 * Ladder-aware rollup for a fleet job stop. The office scheduler rollup lumps
 * arrived/en_route into in_progress, but the field action ladder (Navigate →
 * Arrived → Start → Complete) needs those intermediate states preserved.
 */
export function rollupTechFleetJobStatus(children: TechFleetGroupableJob[]): string {
  if (children.length === 0) return "scheduled";
  const statuses = children.map(getTechJobEffectiveStatus);
  if (statuses.every((status) => CANCELLED_STATUSES.has(status))) return "cancelled";
  if (statuses.every((status) => TERMINAL_STATUSES.has(status) || CANCELLED_STATUSES.has(status))) return "completed";
  if (statuses.some((status) => status === "in_progress")) return "in_progress";
  if (statuses.some((status) => status === "arrived")) return "arrived";
  if (statuses.some((status) => status === "en_route")) return "en_route";
  if (statuses.some((status) => status === "assigned" || status === "scheduled")) return "assigned";
  return statuses[0] ?? "scheduled";
}

function pickRepresentative<TJob extends TechFleetGroupableJob>(children: TJob[]): TJob {
  const open = children.find((child) => {
    const status = getTechJobEffectiveStatus(child);
    return !TERMINAL_STATUSES.has(status) && !CANCELLED_STATUSES.has(status);
  });
  return open ?? children[children.length - 1];
}

/**
 * Collapse fleet work orders sharing a fleet_job_id into one stop per job.
 * Standalone jobs pass through untouched; each group stop takes the position of
 * its earliest child so day schedules stay time-sorted.
 */
export function collapseTechFleetJobs<TJob extends TechFleetGroupableJob>(jobs: TJob[]): Array<TechJobStop<TJob>> {
  const childrenByJob = new Map<string, TJob[]>();
  for (const job of jobs) {
    const groupId = job.is_fleet && job.fleet_job_id ? job.fleet_job_id : null;
    if (!groupId) continue;
    const list = childrenByJob.get(groupId);
    if (list) list.push(job);
    else childrenByJob.set(groupId, [job]);
  }

  const emitted = new Set<string>();
  const stops: Array<TechJobStop<TJob>> = [];

  for (const job of jobs) {
    const groupId = job.is_fleet && job.fleet_job_id ? job.fleet_job_id : null;
    if (!groupId) {
      stops.push(job as TechJobStop<TJob>);
      continue;
    }
    if (emitted.has(groupId)) continue;
    emitted.add(groupId);

    const children = [...(childrenByJob.get(groupId) ?? [])].sort((a, b) =>
      `${a.scheduled_time ?? ""}${a.id}`.localeCompare(`${b.scheduled_time ?? ""}${b.id}`),
    );
    const representative = pickRepresentative(children);
    const rollup = rollupTechFleetJobStatus(children);

    stops.push({
      ...representative,
      status: rollup,
      dispatch_status: rollup,
      fleet_job_id: groupId,
      fleet_job_number: representative.fleet_job_number ?? null,
      fleet_vehicle_count: Math.max(representative.fleet_vehicle_count ?? 0, children.length),
      fleet_children: children,
    });
  }

  return stops;
}

/** Display label for a grouped stop: "FJ-00007 · 5 vehicles". */
export function techFleetJobLabel(stop: { fleet_job_number?: string | null; fleet_vehicle_count?: number | null }): string | null {
  const count = stop.fleet_vehicle_count ?? 0;
  if (!stop.fleet_job_number && count === 0) return null;
  const vehicles = `${count} vehicle${count === 1 ? "" : "s"}`;
  return stop.fleet_job_number ? `${stop.fleet_job_number} · ${vehicles}` : vehicles;
}

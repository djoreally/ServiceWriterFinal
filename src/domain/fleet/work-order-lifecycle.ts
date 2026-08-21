export const FLEET_WORK_ORDER_TRANSITIONS = {
  pending_review: "scheduled",
  draft: "scheduled",
  scheduled: "in_progress",
  assigned: "in_progress",
  en_route: "arrived",
  arrived: "in_progress",
  in_progress: "completed",
  completed: "invoiced",
  invoiced: "paid",
} as const;

export type FleetWorkOrderLifecycleStatus = keyof typeof FLEET_WORK_ORDER_TRANSITIONS;
export type FleetWorkOrderLifecycleTarget = (typeof FLEET_WORK_ORDER_TRANSITIONS)[FleetWorkOrderLifecycleStatus];

export function getNextFleetWorkOrderStatus(status: string): FleetWorkOrderLifecycleTarget | null {
  return FLEET_WORK_ORDER_TRANSITIONS[status as FleetWorkOrderLifecycleStatus] ?? null;
}

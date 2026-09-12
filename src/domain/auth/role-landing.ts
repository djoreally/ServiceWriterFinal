import type { WorkforceRole } from "@/application/queries/workforce-identity.query";

/** Canonical first screen for each confirmed workforce role. */
export const ROLE_LANDING: Record<WorkforceRole, string> = {
  admin: "/dashboard",
  owner: "/dashboard",
  viewer: "/dashboard",
  manager: "/dispatch",
  dispatcher: "/dispatch",
  service_advisor: "/dispatch",
  receptionist: "/dispatch",
  fleet_manager: "/fleet-os",
  technician: "/tech-app",
};

export function roleLandingPath(role: WorkforceRole): string {
  return ROLE_LANDING[role];
}

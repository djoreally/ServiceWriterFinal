/**
 * Single source of truth for workforce route + capability access.
 *
 * Every protected surface is listed here exactly once. `canAccessRoute` is
 * DENY-BY-DEFAULT: an unlisted protected path is denied for non-admins, so a
 * new route cannot silently leak to dispatch/office staff.
 *
 * Navigation (`navItems.ts`), the route guard (`RouteRoleGuard`) and the auth
 * choke point (`RequireAuth`) all resolve against this table, which is what
 * keeps the sidebar and the guards from drifting apart.
 */
import type { TeamRole } from "@/hooks/useTeamRole";

export type AccessRole = TeamRole | "customer";

const ADMIN: AccessRole[] = ["admin", "owner"];
const OFFICE: AccessRole[] = ["admin", "owner", "manager", "service_advisor", "receptionist", "viewer"];
const BOARD: AccessRole[] = ["admin", "owner", "manager", "service_advisor", "receptionist", "dispatcher", "viewer"];
const SCHEDULING: AccessRole[] = [...BOARD, "fleet_manager"];
const FLEET: AccessRole[] = ["admin", "owner", "manager", "dispatcher", "fleet_manager", "viewer"];
const CRM: AccessRole[] = ["admin", "owner", "manager", "dispatcher", "fleet_manager", "service_advisor", "receptionist", "viewer"];
const TECH: AccessRole[] = ["technician"];
const CUSTOMER: AccessRole[] = ["customer"];
const EVERYONE: AccessRole[] = ["admin", "owner", "manager", "dispatcher", "fleet_manager", "technician", "service_advisor", "receptionist", "viewer"];

export interface RouteAccessRule {
  /** Exact path or path prefix (matches `path` and `path/...`). */
  match: string;
  roles: AccessRole[];
}

/**
 * Ordered most-specific-first. The first matching rule wins.
 */
export const ROUTE_ACCESS: RouteAccessRule[] = [
  // --- shared / self-service -------------------------------------------
  { match: "/settings/sessions", roles: EVERYONE },
  { match: "/onboarding", roles: EVERYONE },
  { match: "/plans", roles: EVERYONE },
  { match: "/knowledge-base", roles: EVERYONE },
  { match: "/tutorials", roles: EVERYONE },
  { match: "/whats-new", roles: EVERYONE },
  { match: "/support", roles: EVERYONE },
  { match: "/field-companion", roles: EVERYONE },
  { match: "/customer", roles: CUSTOMER },
  { match: "/customer/dashboard", roles: CUSTOMER },
  { match: "/customer/appointments", roles: CUSTOMER },
  { match: "/customer/vehicles", roles: CUSTOMER },
  { match: "/customer/approvals", roles: CUSTOMER },
  { match: "/customer/invoices", roles: CUSTOMER },
  { match: "/customer/messages", roles: CUSTOMER },
  { match: "/customer/profile", roles: CUSTOMER },

  // --- technician field app --------------------------------------------
  { match: "/tech-app", roles: TECH },

  // --- CRM workspace ----------------------------------------------------
  { match: "/crm", roles: CRM },
  { match: "/settings/import", roles: ADMIN },

  // --- owner / admin only ----------------------------------------------
  { match: "/settings", roles: ADMIN },
  { match: "/invitations", roles: ADMIN },
  { match: "/receptionist", roles: ADMIN },
  { match: "/vehicle-specs", roles: ADMIN },
  { match: "/admin", roles: ADMIN },
  { match: "/marketplace", roles: ADMIN },
  { match: "/marketing", roles: ADMIN },
  { match: "/marketing-videos", roles: ADMIN },
  { match: "/growth-tools", roles: ADMIN },
  { match: "/newsletter", roles: ADMIN },
  { match: "/retention-engine", roles: ADMIN },
  { match: "/retention-verify", roles: ADMIN },
  { match: "/assets", roles: ADMIN },

  // --- finance ----------------------------------------------------------
  { match: "/financials", roles: ADMIN },
  { match: "/expenses", roles: ADMIN },
  { match: "/reports", roles: ADMIN },
  { match: "/operations", roles: ADMIN },
  { match: "/tax-compliance", roles: ADMIN },
  { match: "/invoices", roles: OFFICE },
  { match: "/payments", roles: OFFICE },
  { match: "/pricing-tool", roles: OFFICE },

  // --- dispatch board ---------------------------------------------------
  { match: "/dispatch", roles: BOARD },
  { match: "/dispatch-engine", roles: BOARD },
  { match: "/command-center", roles: BOARD },
  { match: "/appointments", roles: SCHEDULING },
  { match: "/messages", roles: BOARD },
  { match: "/weather-guard", roles: BOARD },
  { match: "/quick-service", roles: BOARD },

  // --- operations -------------------------------------------------------
  { match: "/customers", roles: BOARD },
  { match: "/vehicles", roles: BOARD },
  { match: "/services", roles: BOARD },
  { match: "/quotes", roles: BOARD },
  { match: "/availability", roles: BOARD },
  { match: "/service-catalog", roles: BOARD },
  { match: "/service-packages", roles: BOARD },
  { match: "/tire-pricing", roles: ["admin"] },
  { match: "/detailing-pricing", roles: ["admin"] },
  { match: "/fleet", roles: FLEET },
  { match: "/dashboard", roles: OFFICE },
  { match: "/inventory", roles: OFFICE },
  { match: "/subscriptions", roles: OFFICE },
  { match: "/team-os", roles: OFFICE },
  { match: "/technician-os", roles: OFFICE },

  // --- Fleet OS ---------------------------------------------------------
  { match: "/fleet-os/scheduler", roles: FLEET },
  { match: "/fleet-os/command-center", roles: FLEET },
  { match: "/fleet-os/checkin", roles: FLEET },
  { match: "/fleet-os/tracking", roles: FLEET },
  { match: "/fleet-os/work-orders", roles: FLEET },
  { match: "/fleet-os/vehicles", roles: FLEET },
  { match: "/fleet-os/help", roles: FLEET },
  { match: "/fleet-os", roles: [...OFFICE, "fleet_manager"] },
];

const matches = (pathname: string, match: string) =>
  pathname === match || pathname.startsWith(`${match}/`);

function normalize(pathname: string): string {
  const clean = pathname.split("?")[0].split("#")[0];
  if (clean.length > 1 && clean.endsWith("/")) return clean.slice(0, -1);
  return clean;
}

export function canAccessRoute(role: AccessRole | null, pathname: string): boolean {
  if (!role) return false;
  const path = normalize(pathname);
  const rule = ROUTE_ACCESS.find((r) => matches(path, r.match));
  if (!rule) return role === "admin";
  return rule.roles.includes(role);
}

export type WriteArea =
  | "quotes"
  | "availability"
  | "service-catalog"
  | "service-packages"
  | "appointments"
  | "customers"
  | "invoices"
  | "settings";

const ALL_WRITE_AREAS: WriteArea[] = [
  "quotes",
  "availability",
  "service-catalog",
  "service-packages",
  "appointments",
  "customers",
  "invoices",
  "settings",
];

const READ_ONLY: Record<AccessRole, WriteArea[]> = {
  admin: [],
  owner: [],
  manager: ["settings"],
  service_advisor: ["settings"],
  receptionist: ["settings"],
  dispatcher: ["quotes", "availability", "service-catalog", "service-packages", "settings"],
  fleet_manager: ["settings", "invoices"],
  technician: ["quotes", "availability", "service-catalog", "service-packages", "customers", "invoices", "settings"],
  viewer: ALL_WRITE_AREAS,
  customer: ALL_WRITE_AREAS,
};

export function canWrite(role: AccessRole | null, area: WriteArea): boolean {
  if (!role) return false;
  if (READ_ONLY[role].includes(area)) return false;
  return canAccessRoute(role, `/${area}`);
}

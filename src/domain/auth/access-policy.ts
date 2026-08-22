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
const OFFICE: AccessRole[] = ["admin", "owner", "manager"];
const BOARD: AccessRole[] = ["admin", "owner", "manager", "dispatcher"];
const SCHEDULING: AccessRole[] = [...BOARD, "fleet_manager"];
const FLEET: AccessRole[] = ["admin", "owner", "manager", "dispatcher", "fleet_manager"];
const CRM: AccessRole[] = ["admin", "owner", "manager", "dispatcher", "fleet_manager"];
const TECH: AccessRole[] = ["technician"];
const CUSTOMER: AccessRole[] = ["customer"];
const EVERYONE: AccessRole[] = ["admin", "owner", "manager", "dispatcher", "fleet_manager", "technician"];

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
  // The page performs the capability check against the canonical API. This
  // route-level rule keeps technicians and customer accounts out of CRM URLs.
  { match: "/crm", roles: CRM },

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
  // Owner-only reporting surfaces (revenue / LTV / P&L / expenses).
  { match: "/financials", roles: ADMIN },
  { match: "/expenses", roles: ADMIN },
  { match: "/reports", roles: ADMIN },
  { match: "/operations", roles: ADMIN },
  { match: "/tax-compliance", roles: ADMIN },
  // Office staff bill and collect, but see no reporting.
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
  { match: "/quotes", roles: BOARD }, // dispatcher = read-only, see canWrite()
  { match: "/availability", roles: BOARD }, // dispatcher = read-only
  { match: "/service-catalog", roles: BOARD }, // dispatcher = read-only
  { match: "/service-packages", roles: BOARD }, // dispatcher = read-only
  { match: "/tire-pricing", roles: ["admin"] },
  { match: "/detailing-pricing", roles: ["admin"] },
  { match: "/fleet", roles: FLEET },
  { match: "/dashboard", roles: OFFICE },
  { match: "/inventory", roles: OFFICE },
  { match: "/subscriptions", roles: OFFICE },
  { match: "/team-os", roles: OFFICE },
  { match: "/technician-os", roles: OFFICE },

  // --- Fleet OS ---------------------------------------------------------
  // Dispatchers get the scheduling + board surfaces only; the commercial
  // side of Fleet OS (contracts, invoices, POs, reports) stays with office.
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

/** Strip query strings / hashes so nav paths like `/settings?tab=team` resolve. */
function normalize(pathname: string): string {
  const clean = pathname.split("?")[0].split("#")[0];
  if (clean.length > 1 && clean.endsWith("/")) return clean.slice(0, -1);
  return clean;
}

export function canAccessRoute(role: AccessRole | null, pathname: string): boolean {
  if (!role) return false;
  const path = normalize(pathname);
  const rule = ROUTE_ACCESS.find((r) => matches(path, r.match));
  // Deny by default: unlisted protected routes are owner-only.
  if (!rule) return role === "admin";
  return rule.roles.includes(role);
}

/**
 * Capability areas where a role may read but not mutate.
 * Used by pages to disable mutation controls instead of hiding data.
 */
export type WriteArea =
  | "quotes"
  | "availability"
  | "service-catalog"
  | "service-packages"
  | "appointments"
  | "customers"
  | "invoices"
  | "settings";

const READ_ONLY: Record<AccessRole, WriteArea[]> = {
  admin: [],
  owner: [],
  manager: ["settings"],
  dispatcher: ["quotes", "availability", "service-catalog", "service-packages", "settings"],
  fleet_manager: ["settings", "invoices"],
  technician: ["quotes", "availability", "service-catalog", "service-packages", "customers", "invoices", "settings"],
  customer: ["quotes", "availability", "service-catalog", "service-packages", "appointments", "customers", "invoices", "settings"],
};

export function canWrite(role: AccessRole | null, area: WriteArea): boolean {
  if (!role) return false;
  if (READ_ONLY[role].includes(area)) return false;
  // No read access implies no write access.
  return canAccessRoute(role, `/${area}`);
}

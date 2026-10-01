import { isReservedSubdomain } from "@/lib/reserved-subdomains";

/**
 * Phase 3 migration registry.
 *
 * Pure module — no React, no hooks, SSR-safe. Imported by `ClientOnlyShell`
 * (to decide whether the legacy SPA shell should mount) and by section
 * workers (to register the prefixes they migrate).
 */

/**
 * Path prefixes served by App Router pages under `app/(app)/`.
 * Section workers append their section prefix here in the SAME change that
 * adds the `app/(app)/<section>/page.tsx` — never one without the other.
 *
 * Starts empty: an empty list preserves today's behavior (the SPA serves
 * every path).
 */
export const MIGRATED_ROUTE_PREFIXES: string[] = [
  "/dashboard",
  "/customers",
  "/vehicles",
  "/service-catalog",
  "/appointments",
  "/services",
  "/work-orders",
  "/quick-service",
  "/quotes",
  "/invoices",
  "/payments",
  "/settings",
  "/public-services",
  "/book",
  "/subscribe",
  "/voice-agent",
  // Phase 4: fleet/dispatch
  "/fleet",
  "/fleet-os",
  "/weather-guard",
  "/dispatch-engine",
  "/dispatch",
  "/command-center",
  "/field-companion",
  "/invitations",
  "/team-os",
  "/technician-os",
  "/tech-app",
  // Phase 5: CRM/marketing consolidation (growth tools live under /crm/*)
  "/crm",
  "/vehicle-specs",
  "/features-guide",
  "/features",
  // Phase 5: retired standalone growth-tool URLs — App Router redirect pages
  // point each at its new /crm/* home
  "/growth-tools",
  "/marketing",
  "/marketing-videos",
  "/newsletter",
  "/retention-engine",
  "/retention-verify",
];

/**
 * Path prefixes served by App Router pages on TENANT subdomains
 * (`{slug}.servicewriter.xyz`). Same add-prefix-with-page rule as above.
 *
 * The tenant branch of the SPA (`src/App.tsx`) serves these route shapes;
 * migrate them by adding the corresponding prefixes here:
 * `/customer/dashboard`, `/customer/auth`, `/fleet-manager`,
 * `/fleet-manager/auth`, `/my-bookings`, `/booking-success`,
 * `/messaging-preferences`, `/services`, `/subscribe`, `/embed/services`,
 * `/embed/subscribe`, `/embed/booking`.
 * The tenant catch-all `*` → `TenantBooking` is served by the App Router
 * tenant catch-all page (`app/[[...path]]/page.tsx`).
 */
export const MIGRATED_TENANT_ROUTE_PREFIXES: string[] = [
  "/customer/dashboard",
  "/customer/auth",
  "/fleet-manager",
  "/fleet-manager/auth",
  "/my-bookings",
  "/booking-success",
  "/messaging-preferences",
  "/subscribe",
  "/embed/services",
  "/embed/subscribe",
  "/embed/booking",
];

/**
 * Segment-aware prefix match: `/customers` matches `/customers` and
 * `/customers/123`, but NOT `/customers-foo`.
 */
function matchesPrefix(pathname: string, prefix: string): boolean {
  if (pathname === prefix) return true;
  const base = prefix.endsWith("/") ? prefix : `${prefix}/`;
  return pathname.startsWith(base);
}

function matchesAnyPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => matchesPrefix(pathname, prefix));
}

/** True when `pathname` is served by a migrated App Router page. */
export function isMigratedPath(pathname: string): boolean {
  return matchesAnyPrefix(pathname, MIGRATED_ROUTE_PREFIXES);
}

/** True when `pathname` is served by a migrated tenant-subdomain page. */
export function isMigratedTenantPath(pathname: string): boolean {
  return matchesAnyPrefix(pathname, MIGRATED_TENANT_ROUTE_PREFIXES);
}

const TENANT_ROOT_DOMAIN = "servicewriter.xyz";
const NON_TENANT_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  TENANT_ROOT_DOMAIN,
  `www.${TENANT_ROOT_DOMAIN}`,
]);

function normalizeBookingSlug(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  // Same slug shape used in settings validation and public booking URLs.
  if (!/^[a-z0-9-]+$/.test(normalized)) {
    return null;
  }

  return normalized;
}

/**
 * Pure replication of the hostname → slug branch of `resolveTenant`
 * (`src/application/queries/tenant.query.ts`), which powers
 * `TenantContext`/`useTenant()`.
 *
 * Rules mirrored exactly:
 * - lowercase + trim the hostname;
 * - `localhost`, `127.0.0.1`, `servicewriter.xyz`, `www.servicewriter.xyz`
 *   are never tenants;
 * - only `{slug}.servicewriter.xyz` subdomains resolve;
 * - the slug must match `^[a-z0-9-]+$` and must not be a reserved
 *   infrastructure subdomain (`isReservedSubdomain` is the single source of
 *   truth — e.g. `auth.servicewriter.xyz` renders the normal app routes).
 *
 * The `routeSlug` branch of `resolveTenant` is intentionally not replicated:
 * `ClientOnlyShell` has no route param, and `TenantProvider` is called with
 * no `routeSlug` in both shells, so it never applies there either.
 */
export function getTenantSlugFromHostname(hostname: string): string | null {
  const host = hostname.toLowerCase().trim();
  if (!host || NON_TENANT_HOSTS.has(host)) {
    return null;
  }

  // Only official production subdomains are treated as tenant contexts.
  if (!host.endsWith(`.${TENANT_ROOT_DOMAIN}`)) {
    return null;
  }

  const slugCandidate = host.slice(0, -1 * (`.${TENANT_ROOT_DOMAIN}`.length));
  const normalizedSubdomainSlug = normalizeBookingSlug(slugCandidate);
  // Infrastructure hosts (auth.*, app.*, api.* …) are never tenants.
  if (!normalizedSubdomainSlug || isReservedSubdomain(normalizedSubdomainSlug)) {
    return null;
  }

  return normalizedSubdomainSlug;
}

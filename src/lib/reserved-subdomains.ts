/**
 * Reserved subdomains for servicewriter.xyz.
 *
 * Tenant booking sites are served from `{booking_slug}.servicewriter.xyz`, so any
 * hostname label that infrastructure needs must never be resolvable as a tenant.
 *
 * `auth.servicewriter.xyz` is the OAuth consent host: the authorization server
 * redirects MCP clients to `<auth host>/.lovable/oauth/consent`, and that route
 * only renders when the host is NOT treated as a tenant. Without this list the
 * label `auth` resolves to a tenant slug and the consent page falls through to
 * the tenant booking catch-all route.
 *
 * This module is the single source of truth for both directions:
 *  - host resolution (`resolveTenant`) must skip these labels
 *  - slug selection (Settings) must refuse to hand these out
 */

/** Hostname labels that can never be a tenant booking slug. */
export const RESERVED_SUBDOMAINS: readonly string[] = [
  // OAuth / MCP infrastructure
  "auth",
  "oauth",
  "mcp",
  "agent",
  "agent-api",
  "connect",
  // Core app + API hosts
  "www",
  "app",
  "api",
  "admin",
  "dashboard",
  "portal",
  "login",
  "account",
  "accounts",
  // Platform / build hosts
  "preview",
  "id-preview",
  "staging",
  "test",
  "dev",
  "internal",
  // Static + mail infrastructure
  "static",
  "assets",
  "cdn",
  "img",
  "media",
  "files",
  "mail",
  "email",
  "smtp",
  "webmail",
  "mx",
  "ns",
  "ns1",
  "ns2",
  // Content / support surfaces
  "support",
  "help",
  "status",
  "docs",
  "blog",
  "billing",
  "pay",
  "payments",
  "webhook",
  "webhooks",
];

const RESERVED_SET = new Set(RESERVED_SUBDOMAINS);

/**
 * True when `label` is infrastructure and must not resolve to a tenant.
 * Matching is case-insensitive and whitespace-tolerant.
 */
export function isReservedSubdomain(label: string | null | undefined): boolean {
  if (!label) return false;
  return RESERVED_SET.has(label.trim().toLowerCase());
}

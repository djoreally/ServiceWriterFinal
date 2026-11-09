/**
 * Agent API scopes.
 *
 * A workspace API key carries a set of these scopes. Every agent endpoint
 * and every MCP tool declares the one scope it needs; the auth layer denies
 * the call when the key does not hold it. Scopes are deliberately coarse —
 * one per resource family and verb — so a workspace admin can hand an
 * integrator exactly the access it needs and nothing more.
 */
export const AGENT_SCOPES = [
  "catalog:read",
  "availability:read",
  "bookings:read",
  "bookings:create",
  "customers:read",
  "customers:create",
  "vehicles:read",
  "locations:read",
  "invoices:read",
  "reports:read",
  "promotions:read",
] as const;

export type AgentScope = (typeof AGENT_SCOPES)[number];

export function isAgentScope(value: unknown): value is AgentScope {
  return typeof value === "string" && (AGENT_SCOPES as readonly string[]).includes(value);
}

/** Scopes an admin may grant when creating a key (all of them, today). */
export function sanitizeScopes(input: unknown): AgentScope[] {
  if (!Array.isArray(input)) return [];
  const out: AgentScope[] = [];
  for (const value of input) {
    if (isAgentScope(value) && !out.includes(value)) out.push(value);
  }
  return out;
}

export function hasScope(granted: readonly string[], required: AgentScope): boolean {
  return granted.includes(required);
}

/**
 * Agent API keys — client-side types and pure logic for the in-app key
 * generator (Agent Integrations page).
 *
 * The server contract lives in `src/server/agent-api/` (key management
 * routes in `src/server/hono/routes/agent-api.ts`): keys are per-workspace,
 * only the SHA-256 hash is stored, and the raw key is returned exactly
 * once at creation. The scope list below mirrors `AGENT_SCOPES` in
 * `src/server/agent-api/scopes.ts` — a unit test pins the two together so
 * they cannot drift.
 */

/** A key record as returned by GET /v1/agent/keys (never contains key material). */
export interface AgentApiKeyRecord {
  id: string;
  workspace_id: string;
  name: string;
  integrator: string;
  /** Non-secret display prefix, e.g. "sw_live_ab12cd34". */
  key_prefix: string;
  scopes: string[];
  created_by_user_id: string | null;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
}

/** The POST /v1/agent/keys response: the record plus the one-time raw key. */
export interface CreatedAgentApiKey extends AgentApiKeyRecord {
  raw_key: string;
}

export interface AgentScopeOption {
  value: string;
  label: string;
  hint: string;
}

/** All grantable scopes, in the server's canonical order, with plain-English labels. */
export const AGENT_SCOPE_OPTIONS: readonly AgentScopeOption[] = [
  { value: "catalog:read", label: "View the services catalog", hint: "Services, prices, and durations." },
  { value: "availability:read", label: "Check availability", hint: "Ask the booking rules whether a slot is open, and see a day's open slots." },
  { value: "bookings:read", label: "View bookings", hint: "List and inspect appointments." },
  { value: "bookings:create", label: "Create bookings", hint: "Book appointments through the workspace's own booking rules, at catalog prices." },
  { value: "customers:read", label: "View customers", hint: "Search customers and see their history." },
  { value: "customers:create", label: "Create customers", hint: "Add new customer records." },
  { value: "vehicles:read", label: "View vehicles", hint: "Search the vehicles the workspace services." },
  { value: "locations:read", label: "View locations", hint: "The workspace's service locations." },
  { value: "invoices:read", label: "View invoices", hint: "Customer invoices and balances." },
  { value: "reports:read", label: "View reports", hint: "Revenue summaries and booking performance." },
  { value: "promotions:read", label: "View promotions", hint: "Campaigns and promotions." },
];

export const ALL_AGENT_SCOPES: readonly string[] = AGENT_SCOPE_OPTIONS.map((option) => option.value);

/** The "Read only" preset: every *:read scope, nothing that writes. */
export const READ_ONLY_AGENT_SCOPES: readonly string[] = AGENT_SCOPE_OPTIONS
  .map((option) => option.value)
  .filter((value) => value.endsWith(":read"));

export function scopeLabel(value: string): string {
  return AGENT_SCOPE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export type AgentKeyStatus = "active" | "revoked" | "expired";

/** Revocation wins over expiry; a key is expired once its expiry instant passes. */
export function deriveKeyStatus(key: Pick<AgentApiKeyRecord, "revoked_at" | "expires_at">, now: number = Date.now()): AgentKeyStatus {
  if (key.revoked_at) return "revoked";
  if (key.expires_at && Date.parse(key.expires_at) <= now) return "expired";
  return "active";
}

/** The stored prefix identifies a key without revealing it; the ellipsis marks it as partial. */
export function displayKeyPrefix(keyPrefix: string): string {
  return `${keyPrefix}…`;
}

export interface AgentKeyFormInput {
  name: string;
  integrator: string;
  scopes: readonly string[];
}

/** Mirror of the server's create-key limits (zod schema in the agent-api router). */
export function validateAgentKeyForm(input: AgentKeyFormInput): string | null {
  const name = input.name.trim();
  if (!name) return "Give the key a name.";
  if (name.length > 120) return "The name must be 120 characters or fewer.";
  const integrator = input.integrator.trim();
  if (!integrator) return "Say who or what this key is for.";
  if (integrator.length > 120) return "The integrator must be 120 characters or fewer.";
  if (input.scopes.length === 0) return "Pick at least one scope.";
  if (input.scopes.length > 20) return "A key can hold at most 20 scopes.";
  return null;
}

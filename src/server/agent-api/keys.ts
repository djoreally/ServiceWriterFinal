/**
 * Workspace API keys — generation, hashing, authentication, management.
 *
 * Pattern follows the platform's existing server-to-server secrets
 * (constant-time comparison, honest errors) and the SalesTeam MCP key
 * design (per-workspace keys, SHA-256 hash at rest, shown once at
 * creation). Keys are workspace-generic platform capability: nothing in
 * this module knows or cares which workspace a key belongs to beyond the
 * row it is bound to.
 *
 * Key format: `sw_live_<43-char base64url secret>` (32 random bytes).
 * Only the SHA-256 hash and a short non-secret prefix are stored.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { ApiError } from "@/server/api";
import { hasScope, sanitizeScopes, type AgentScope } from "./scopes";

export const API_KEY_PREFIX = "sw_live_";
const KEY_DISPLAY_PREFIX_LENGTH = API_KEY_PREFIX.length + 8;

export interface WorkspaceApiKeyRecord {
  id: string;
  workspace_id: string;
  name: string;
  integrator: string;
  key_prefix: string;
  scopes: string[];
  created_by_user_id: string | null;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
}

export interface AgentKeyContext {
  keyId: string;
  workspaceId: string;
  integrator: string;
  scopes: string[];
}

export function generateApiKey(): { rawKey: string; keyPrefix: string; keyHash: string } {
  const rawKey = API_KEY_PREFIX + randomBytes(32).toString("base64url");
  return {
    rawKey,
    keyPrefix: rawKey.slice(0, KEY_DISPLAY_PREFIX_LENGTH),
    keyHash: hashApiKey(rawKey),
  };
}

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey, "utf8").digest("hex");
}

export function isApiKeyShape(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(API_KEY_PREFIX) && value.length >= API_KEY_PREFIX.length + 20;
}

/** Extract the presented key from Authorization: Bearer or x-api-key. */
export function extractApiKey(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (bearer && isApiKeyShape(bearer)) return bearer;
  const headerKey = request.headers.get("x-api-key")?.trim();
  if (headerKey && isApiKeyShape(headerKey)) return headerKey;
  return null;
}

function hashesEqual(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, "hex");
  const b = Buffer.from(bHex, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Resolve a presented raw key to its workspace context.
 *
 * `db` must be a service-role (admin) Supabase client: key rows are not
 * readable by anon/authenticated roles, by design. The workspace comes
 * from the key record — never from caller input — so a key cannot be
 * aimed at another workspace.
 */
export async function authenticateApiKey(
  db: any,
  rawKey: string | null,
): Promise<AgentKeyContext> {
  if (!rawKey || !isApiKeyShape(rawKey)) {
    throw new ApiError(401, "A valid Service Writer API key is required", "unauthenticated");
  }
  const presentedHash = hashApiKey(rawKey);
  const { data, error } = await db
    .from("workspace_api_keys")
    .select("id,workspace_id,integrator,scopes,key_hash,revoked_at,expires_at")
    .eq("key_hash", presentedHash)
    .maybeSingle();
  if (error) throw error;
  const row = data as (WorkspaceApiKeyRecord & { key_hash: string }) | null;
  if (!row || !hashesEqual(row.key_hash, presentedHash)) {
    throw new ApiError(401, "A valid Service Writer API key is required", "unauthenticated");
  }
  if (row.revoked_at) {
    throw new ApiError(401, "This API key has been revoked", "key_revoked");
  }
  if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) {
    throw new ApiError(401, "This API key has expired", "key_expired");
  }

  // Best-effort last-used stamp; never block the request on it.
  void Promise.resolve(
    db.from("workspace_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", row.id),
  ).catch(() => undefined);

  return {
    keyId: row.id,
    workspaceId: row.workspace_id,
    integrator: row.integrator,
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
  };
}

export function requireScope(ctx: AgentKeyContext, scope: AgentScope): void {
  if (!hasScope(ctx.scopes, scope)) {
    throw new ApiError(
      403,
      `This API key does not hold the required scope: ${scope}`,
      "insufficient_scope",
    );
  }
}

/**
 * Reject a caller-supplied workspace id that disagrees with the key.
 * Matching or absent values are fine; the key's workspace always wins.
 */
export function assertWorkspaceMatch(ctx: AgentKeyContext, claimed: unknown): void {
  if (typeof claimed === "string" && claimed.length > 0 && claimed !== ctx.workspaceId) {
    throw new ApiError(
      403,
      "The workspace_id does not match the workspace this API key belongs to",
      "workspace_mismatch",
    );
  }
}

/** Record an action in the key usage trail (attribution). Fire-and-forget. */
export async function recordKeyUsage(
  db: any,
  ctx: AgentKeyContext,
  action: string,
  resourceType?: string,
  resourceId?: string,
): Promise<void> {
  try {
    const { error } = await db.from("workspace_api_key_usage").insert({
      api_key_id: ctx.keyId,
      workspace_id: ctx.workspaceId,
      integrator: ctx.integrator,
      action,
      resource_type: resourceType ?? null,
      resource_id: resourceId ?? null,
    });
    if (error) console.error("[agent-api] usage insert failed", error);
  } catch (e) {
    console.error("[agent-api] usage insert failed", e);
  }
}

// ---------------------------------------------------------------------------
// Key management (staff-session side; the router enforces admin membership
// before calling these). The raw key is returned exactly once, at creation.
// ---------------------------------------------------------------------------

export async function createWorkspaceApiKey(
  db: any,
  input: {
    workspaceId: string;
    name: string;
    integrator: string;
    scopes: unknown;
    createdByUserId: string | null;
    expiresAt?: string | null;
  },
): Promise<{ key: WorkspaceApiKeyRecord; rawKey: string }> {
  const scopes = sanitizeScopes(input.scopes);
  if (scopes.length === 0) {
    throw new ApiError(400, "At least one valid scope is required", "invalid_scope");
  }
  const { rawKey, keyPrefix, keyHash } = generateApiKey();
  const { data, error } = await db
    .from("workspace_api_keys")
    .insert({
      workspace_id: input.workspaceId,
      name: input.name,
      integrator: input.integrator,
      key_prefix: keyPrefix,
      key_hash: keyHash,
      scopes,
      created_by_user_id: input.createdByUserId,
      expires_at: input.expiresAt ?? null,
    })
    .select("id,workspace_id,name,integrator,key_prefix,scopes,created_by_user_id,created_at,last_used_at,expires_at,revoked_at")
    .single();
  if (error) throw error;
  return { key: data as WorkspaceApiKeyRecord, rawKey };
}

export async function listWorkspaceApiKeys(
  db: any,
  workspaceId: string,
): Promise<WorkspaceApiKeyRecord[]> {
  const { data, error } = await db
    .from("workspace_api_keys")
    .select("id,workspace_id,name,integrator,key_prefix,scopes,created_by_user_id,created_at,last_used_at,expires_at,revoked_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as WorkspaceApiKeyRecord[];
}

export async function revokeWorkspaceApiKey(
  db: any,
  workspaceId: string,
  keyId: string,
): Promise<WorkspaceApiKeyRecord> {
  const { data, error } = await db
    .from("workspace_api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("id", keyId)
    .is("revoked_at", null)
    .select("id,workspace_id,name,integrator,key_prefix,scopes,created_by_user_id,created_at,last_used_at,expires_at,revoked_at")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, "API key not found or already revoked", "not_found");
  return data as WorkspaceApiKeyRecord;
}

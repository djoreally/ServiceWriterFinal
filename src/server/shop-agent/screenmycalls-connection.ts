/**
 * ScreenMyCalls connection store — the workspace's pairing credential.
 *
 * The credential lives on the workspace's `provider_connections` row
 * (provider = "screenmycalls"), the same table the AgentPhone setup uses
 * — no parallel table. Setup inserts one row per connected workspace;
 * the connection flow in src/server/hono/routes/screenmycalls.ts owns
 * the writes (after workspace membership is authorized, via the admin
 * client, like the other shop-agent server paths).
 *
 * metadata shape:
 *   {
 *     key_id: string,          // public pairing id (selects the row)
 *     secret: string,          // HMAC/signing secret — server-side only,
 *                              // never returned to the browser
 *     smc_org_id: string,      // the ScreenMyCalls organization id
 *     smc_org_name: string,
 *     number: string | null,   // the shop's chosen ScreenMyCalls number
 *     connected_at: string,    // ISO timestamp
 *   }
 *
 * Disconnect clears the secret and stamps `revoked: true`: without a
 * secret the row authenticates nothing (the mirror intake resolves
 * pairings by key_id + secret), and the connection reads as gone.
 */
import type { ShopAgentSupabase } from "./channels/db";

/** provider_connections.provider value for the ScreenMyCalls pairing. */
export const SMC_PROVIDER = "screenmycalls";

export interface ScreenMyCallsConnection {
  workspaceId: string;
  keyId: string;
  secret: string;
  smcOrgId: string;
  smcOrgName: string | null;
  number: string | null;
  connectedAt: string | null;
}

interface ConnectionRow {
  workspace_id?: unknown;
  metadata?: Record<string, unknown> | null;
}

function rowToConnection(workspaceId: string, row: ConnectionRow | undefined): ScreenMyCallsConnection | null {
  const meta = row?.metadata ?? null;
  if (!meta || meta.revoked === true) return null;
  const keyId = meta.key_id;
  const secret = meta.secret;
  const smcOrgId = meta.smc_org_id;
  if (typeof keyId !== "string" || !keyId) return null;
  if (typeof secret !== "string" || !secret) return null;
  if (typeof smcOrgId !== "string" || !smcOrgId) return null;
  return {
    workspaceId,
    keyId,
    secret,
    smcOrgId,
    smcOrgName: typeof meta.smc_org_name === "string" ? meta.smc_org_name : null,
    number: typeof meta.number === "string" ? meta.number : null,
    connectedAt: typeof meta.connected_at === "string" ? meta.connected_at : null,
  };
}

export async function getScreenMyCallsConnection(
  supabase: ShopAgentSupabase,
  workspaceId: string,
): Promise<ScreenMyCallsConnection | null> {
  const { data, error } = await supabase
    .from("provider_connections")
    .select("workspace_id,metadata")
    .eq("workspace_id", workspaceId)
    .eq("provider", SMC_PROVIDER)
    .limit(1);
  if (error) throw error;
  const row = (data ?? [])[0] as ConnectionRow | undefined;
  return rowToConnection(workspaceId, row);
}

export async function saveScreenMyCallsConnection(
  supabase: ShopAgentSupabase,
  workspaceId: string,
  input: { keyId: string; secret: string; smcOrgId: string; smcOrgName?: string | null },
): Promise<ScreenMyCallsConnection> {
  const metadata = {
    key_id: input.keyId,
    secret: input.secret,
    smc_org_id: input.smcOrgId,
    smc_org_name: input.smcOrgName ?? null,
    number: null,
    connected_at: new Date().toISOString(),
  };
  const existing = await getScreenMyCallsConnection(supabase, workspaceId);
  if (existing) {
    const { error } = await supabase
      .from("provider_connections")
      .update({ metadata })
      .eq("workspace_id", workspaceId)
      .eq("provider", SMC_PROVIDER);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("provider_connections")
      .insert({ workspace_id: workspaceId, provider: SMC_PROVIDER, metadata });
    if (error) throw error;
  }
  return {
    workspaceId,
    keyId: input.keyId,
    secret: input.secret,
    smcOrgId: input.smcOrgId,
    smcOrgName: input.smcOrgName ?? null,
    number: null,
    connectedAt: metadata.connected_at,
  };
}

export async function setScreenMyCallsConnectionNumber(
  supabase: ShopAgentSupabase,
  workspaceId: string,
  number: string,
): Promise<void> {
  const existing = await getScreenMyCallsConnection(supabase, workspaceId);
  if (!existing) return;
  const { data, error } = await supabase
    .from("provider_connections")
    .select("metadata")
    .eq("workspace_id", workspaceId)
    .eq("provider", SMC_PROVIDER)
    .limit(1);
  if (error) throw error;
  const meta = ((data ?? [])[0] as ConnectionRow | undefined)?.metadata ?? {};
  const { error: updateError } = await supabase
    .from("provider_connections")
    .update({ metadata: { ...meta, number } })
    .eq("workspace_id", workspaceId)
    .eq("provider", SMC_PROVIDER);
  if (updateError) throw updateError;
}

export async function clearScreenMyCallsConnection(
  supabase: ShopAgentSupabase,
  workspaceId: string,
): Promise<void> {
  const { error } = await supabase
    .from("provider_connections")
    .update({ metadata: { revoked: true, revoked_at: new Date().toISOString() } })
    .eq("workspace_id", workspaceId)
    .eq("provider", SMC_PROVIDER);
  if (error) throw error;
}

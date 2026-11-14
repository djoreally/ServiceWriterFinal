/**
 * ScreenMyCalls connection router — the ServiceWriter side of the bundle.
 *
 * ScreenMyCalls comes free with ServiceWriter, and this is where a shop
 * signs up for it: Settings → Agent integrations → ScreenMyCalls. The
 * flow, end to end:
 *
 *   1. POST /v1/integrations/screenmycalls/connect
 *      Creates (or links, via link code) the shop's ScreenMyCalls org
 *      through the ScreenMyCalls pairing API. The pairing credential
 *      ScreenMyCalls mints is stored on the workspace's
 *      provider_connections row — server-side only, never returned to
 *      the browser. The org is created on the ServiceWriter bundle:
 *      starter plan active + a 100-minute bundle grant, no Stripe.
 *   2. Number step: search Telnyx inventory and purchase a number for
 *      the org (through ScreenMyCalls' real provisioning), or pick one
 *      the org already has. The choice is recorded on both sides.
 *   3. Mirror toggle: completed bookings mirror into this workspace's
 *      appointments (intake: POST /v1/shop-agent/screenmycalls).
 *   4. 10DLC step: register the shop's own A2P brand + campaign with
 *      Telnyx (through ScreenMyCalls) for custom texting.
 *
 * Authorization: every route requires an owner/admin workspace member;
 * the workspace in the request must be the workspace being connected —
 * a member of shop A cannot drive shop B's connection. All
 * ScreenMyCalls calls after connect ride the workspace's own pairing
 * credential, so ScreenMyCalls scopes every action to the paired org.
 */
import { Hono } from "hono";
import { z } from "zod";
import { ApiError, json, requireWorkspaceMember } from "@/server/api";
import { createSupabaseAdminClient } from "@/lib/supabase";
import type { ShopAgentSupabase } from "@/server/shop-agent/channels/db";
import {
  ScreenMyCallsApiError,
  ScreenMyCallsClient,
  SCREENMYCALLS_INTAKE_PATH,
  type PairingCredential,
} from "@/server/shop-agent/screenmycalls-client";
import {
  clearScreenMyCallsConnection,
  getScreenMyCallsConnection,
  saveScreenMyCallsConnection,
  setScreenMyCallsConnectionNumber,
  type ScreenMyCallsConnection,
} from "@/server/shop-agent/screenmycalls-connection";

export const screenMyCallsRouter = new Hono();

const ROLES = ["owner", "admin"];

const workspaceBody = z.object({ workspace_id: z.string().uuid() });

function adminSupabase(): ShopAgentSupabase {
  return createSupabaseAdminClient() as unknown as ShopAgentSupabase;
}

async function authorize(c: { req: { raw: Request } }, workspaceId: string) {
  await requireWorkspaceMember(workspaceId, ROLES, c.req.raw);
  return adminSupabase();
}

function smcError(err: unknown): ApiError {
  if (err instanceof ScreenMyCallsApiError) {
    return new ApiError(err.status, err.message, err.code);
  }
  return new ApiError(502, err instanceof Error ? err.message : "ScreenMyCalls request failed", "screenmycalls_error");
}

async function requireConnection(
  supabase: ShopAgentSupabase,
  workspaceId: string,
): Promise<ScreenMyCallsConnection> {
  const conn = await getScreenMyCallsConnection(supabase, workspaceId);
  if (!conn) {
    throw new ApiError(409, "ScreenMyCalls is not connected for this workspace yet.", "not_connected");
  }
  return conn;
}

function credentialOf(conn: ScreenMyCallsConnection): PairingCredential {
  return { keyId: conn.keyId, secret: conn.secret };
}

/** Public (browser-safe) connection state — never includes the secret. */
function publicState(conn: ScreenMyCallsConnection | null) {
  if (!conn) return { connected: false as const };
  return {
    connected: true as const,
    organizationId: conn.smcOrgId,
    organizationName: conn.smcOrgName,
    number: conn.number,
    connectedAt: conn.connectedAt,
  };
}

// ---------------------------------------------------------------------------
// Connect (signup / link)
// ---------------------------------------------------------------------------

const connectSchema = z.object({
  workspace_id: z.string().uuid(),
  mode: z.enum(["create", "link"]),
  business_name: z.string().trim().min(1).max(200).optional(),
  admin_email: z.string().email().max(320).optional(),
  link_code: z.string().trim().min(4).max(64).optional(),
});

screenMyCallsRouter.post("/v1/integrations/screenmycalls/connect", async (c) => {
  const body = connectSchema.parse(await c.req.json());
  const supabase = await authorize(c, body.workspace_id);

  const existing = await getScreenMyCallsConnection(supabase, body.workspace_id);
  if (existing) {
    throw new ApiError(409, "ScreenMyCalls is already connected for this workspace.", "already_connected");
  }

  const client = new ScreenMyCallsClient();
  const intakeUrl = `${new URL(c.req.url).origin}${SCREENMYCALLS_INTAKE_PATH}`;
  try {
    const result =
      body.mode === "create"
        ? await client.createOrg({
            swWorkspaceId: body.workspace_id,
            businessName: body.business_name ?? "",
            adminEmail: body.admin_email ?? "",
            intakeUrl,
          })
        : await client.redeemLinkCode({
            swWorkspaceId: body.workspace_id,
            linkCode: body.link_code ?? "",
            intakeUrl,
          });
    const conn = await saveScreenMyCallsConnection(supabase, body.workspace_id, {
      keyId: result.keyId,
      secret: result.secret,
      smcOrgId: result.organizationId,
      smcOrgName: result.organizationName,
    });
    return json({ data: { ...publicState(conn), mirrorEnabled: result.mirrorEnabled } }, { status: 201 });
  } catch (err) {
    throw smcError(err);
  }
});

// ---------------------------------------------------------------------------
// Status (connection + live ScreenMyCalls state)
// ---------------------------------------------------------------------------

screenMyCallsRouter.get("/v1/integrations/screenmycalls/status", async (c) => {
  const workspaceId = c.req.query("workspace_id") ?? "";
  const parsed = z.string().uuid().safeParse(workspaceId);
  if (!parsed.success) throw new ApiError(400, "Invalid workspace_id", "invalid_workspace");
  const supabase = await authorize(c, workspaceId);

  const conn = await getScreenMyCallsConnection(supabase, workspaceId);
  if (!conn) return json({ data: publicState(null) });

  const client = new ScreenMyCallsClient();
  try {
    const live = await client.credentialAction(credentialOf(conn), "status");
    return json({ data: { ...publicState(conn), live } });
  } catch (err) {
    throw smcError(err);
  }
});

// ---------------------------------------------------------------------------
// Number step: search / purchase / select
// ---------------------------------------------------------------------------

const searchSchema = workspaceBody.extend({
  area_code: z.string().trim().max(10).optional(),
  state: z.string().trim().max(10).optional(),
  city: z.string().trim().max(120).optional(),
  pattern: z.string().trim().max(40).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

screenMyCallsRouter.post("/v1/integrations/screenmycalls/numbers/search", async (c) => {
  const body = searchSchema.parse(await c.req.json());
  const supabase = await authorize(c, body.workspace_id);
  const conn = await requireConnection(supabase, body.workspace_id);
  const client = new ScreenMyCallsClient();
  try {
    const res = await client.credentialAction(credentialOf(conn), "numbers.search", {
      area_code: body.area_code,
      state: body.state,
      city: body.city,
      pattern: body.pattern,
      limit: body.limit,
    });
    return json({ data: res });
  } catch (err) {
    throw smcError(err);
  }
});

const purchaseSchema = workspaceBody.extend({
  phone_number: z.string().trim().min(7).max(20),
});

screenMyCallsRouter.post("/v1/integrations/screenmycalls/numbers/purchase", async (c) => {
  const body = purchaseSchema.parse(await c.req.json());
  const supabase = await authorize(c, body.workspace_id);
  const conn = await requireConnection(supabase, body.workspace_id);
  const client = new ScreenMyCallsClient();
  try {
    const res = await client.credentialAction(credentialOf(conn), "numbers.purchase", {
      phone_number: body.phone_number,
    });
    if (typeof res.phoneNumber === "string") {
      await setScreenMyCallsConnectionNumber(supabase, body.workspace_id, res.phoneNumber);
    }
    return json({ data: res }, { status: 201 });
  } catch (err) {
    throw smcError(err);
  }
});

const selectSchema = workspaceBody.extend({
  phone_number: z.string().trim().min(7).max(20),
});

screenMyCallsRouter.post("/v1/integrations/screenmycalls/numbers/select", async (c) => {
  const body = selectSchema.parse(await c.req.json());
  const supabase = await authorize(c, body.workspace_id);
  const conn = await requireConnection(supabase, body.workspace_id);
  const client = new ScreenMyCallsClient();
  try {
    const res = await client.credentialAction(credentialOf(conn), "numbers.select", {
      phone_number: body.phone_number,
    });
    await setScreenMyCallsConnectionNumber(supabase, body.workspace_id, body.phone_number);
    return json({ data: res });
  } catch (err) {
    throw smcError(err);
  }
});

// ---------------------------------------------------------------------------
// Mirror toggle
// ---------------------------------------------------------------------------

const mirrorSchema = workspaceBody.extend({ enabled: z.boolean() });

screenMyCallsRouter.post("/v1/integrations/screenmycalls/mirror", async (c) => {
  const body = mirrorSchema.parse(await c.req.json());
  const supabase = await authorize(c, body.workspace_id);
  const conn = await requireConnection(supabase, body.workspace_id);
  const client = new ScreenMyCallsClient();
  try {
    const res = await client.credentialAction(credentialOf(conn), "mirror.set", { enabled: body.enabled });
    return json({ data: res });
  } catch (err) {
    throw smcError(err);
  }
});

// ---------------------------------------------------------------------------
// 10DLC step (A2P brand + campaign, registered through ScreenMyCalls)
// ---------------------------------------------------------------------------

const tenDlcSchema = workspaceBody.extend({
  legal_business_name: z.string().trim().min(1).max(200),
  ein: z.string().trim().min(4).max(20),
  business_type: z.string().trim().min(1).max(60),
  industry: z.string().trim().min(1).max(120),
  website: z.string().trim().max(320).optional(),
  address: z.string().trim().min(1).max(300),
  city: z.string().trim().min(1).max(120),
  state: z.string().trim().min(1).max(60),
  postal_code: z.string().trim().min(1).max(24),
  country: z.string().trim().length(2).default("US"),
  contact_email: z.string().email().max(320),
  contact_phone: z.string().trim().min(7).max(24),
  use_case: z.string().trim().min(1).max(120).default("CUSTOMER_CARE"),
  message_samples: z.array(z.string().trim().min(1).max(480)).min(1).max(5),
});

screenMyCallsRouter.post("/v1/integrations/screenmycalls/10dlc", async (c) => {
  const body = tenDlcSchema.parse(await c.req.json());
  const supabase = await authorize(c, body.workspace_id);
  const conn = await requireConnection(supabase, body.workspace_id);
  const client = new ScreenMyCallsClient();
  try {
    const { workspace_id: _ws, ...registration } = body;
    const res = await client.credentialAction(credentialOf(conn), "tendlc.register", registration);
    return json({ data: res }, { status: 201 });
  } catch (err) {
    throw smcError(err);
  }
});

screenMyCallsRouter.get("/v1/integrations/screenmycalls/10dlc", async (c) => {
  const workspaceId = c.req.query("workspace_id") ?? "";
  const parsed = z.string().uuid().safeParse(workspaceId);
  if (!parsed.success) throw new ApiError(400, "Invalid workspace_id", "invalid_workspace");
  const supabase = await authorize(c, workspaceId);
  const conn = await requireConnection(supabase, workspaceId);
  const client = new ScreenMyCallsClient();
  try {
    const res = await client.credentialAction(credentialOf(conn), "tendlc.status");
    return json({ data: res });
  } catch (err) {
    throw smcError(err);
  }
});

// ---------------------------------------------------------------------------
// Disconnect
// ---------------------------------------------------------------------------

screenMyCallsRouter.post("/v1/integrations/screenmycalls/disconnect", async (c) => {
  const body = workspaceBody.parse(await c.req.json());
  const supabase = await authorize(c, body.workspace_id);
  const conn = await getScreenMyCallsConnection(supabase, body.workspace_id);
  if (conn) {
    const client = new ScreenMyCallsClient();
    // Best-effort: the local credential is revoked regardless, so a
    // ScreenMyCalls outage can never strand the connection half-open.
    await client.credentialAction(credentialOf(conn), "disconnect").catch(() => null);
    await clearScreenMyCallsConnection(supabase, body.workspace_id);
  }
  return json({ data: { connected: false } });
});

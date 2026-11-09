/**
 * Agent API router — the standard external connection to Service Writer.
 *
 * Two surfaces, one contract (see src/server/agent-api/service.ts):
 *   - REST:  /api/v1/agent/*   (workspace API key auth)
 *   - MCP:   /api/mcp          (Streamable HTTP JSON-RPC, same key auth)
 *
 * Plus key management for workspace admins on a staff session:
 *   - GET    /api/v1/agent/keys?workspace_id=
 *   - POST   /api/v1/agent/keys            (raw key returned exactly once)
 *   - DELETE /api/v1/agent/keys/:id?workspace_id=
 *
 * Everything here is additive: no existing route changes behavior. The
 * workspace for every key-authenticated call comes from the key record,
 * never from the caller — a caller-supplied workspace_id that disagrees
 * with the key is rejected, so keys cannot cross workspaces.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { ApiError, json } from "@/server/api";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { requireWorkspaceAuth } from "../middleware/auth";
import {
  assertWorkspaceMatch,
  authenticateApiKey,
  createWorkspaceApiKey,
  extractApiKey,
  listWorkspaceApiKeys,
  revokeWorkspaceApiKey,
  type AgentKeyContext,
} from "@/server/agent-api/keys";
import { handleMcpMessage } from "@/server/agent-api/mcp";
import * as svc from "@/server/agent-api/service";

export const agentApiRouter = new Hono();

const ADMIN_ROLES = ["owner", "admin"];

async function withKey(c: Context): Promise<{ db: any; ctx: AgentKeyContext }> {
  const db = createSupabaseAdminClient();
  const ctx = await authenticateApiKey(db, extractApiKey(c.req.raw));
  return { db, ctx };
}

function claimedWorkspace(c: Context, body?: Record<string, unknown>): string | null {
  const fromQuery = new URL(c.req.url).searchParams.get("workspace_id");
  const fromBody = typeof body?.workspace_id === "string" ? (body.workspace_id as string) : null;
  return fromBody ?? fromQuery;
}

// ---------------------------------------------------------------------------
// Key management (staff session, workspace admins only)
// ---------------------------------------------------------------------------

agentApiRouter.get("/v1/agent/keys", async (c) => {
  const workspaceId = new URL(c.req.url).searchParams.get("workspace_id");
  if (!workspaceId) throw new ApiError(400, "workspace_id is required", "missing_workspace");
  const { supabase } = await requireWorkspaceAuth(c, workspaceId, ADMIN_ROLES);
  const keys = await listWorkspaceApiKeys(supabase as any, workspaceId);
  return json({ data: keys });
});

const createKeySchema = z.object({
  workspace_id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  integrator: z.string().trim().min(1).max(120),
  scopes: z.array(z.string().trim().min(1).max(60)).min(1).max(20),
  expires_at: z.string().datetime().nullable().optional(),
});

agentApiRouter.post("/v1/agent/keys", async (c) => {
  const body = createKeySchema.parse(await c.req.json());
  const { supabase, user } = await requireWorkspaceAuth(c, body.workspace_id, ADMIN_ROLES);
  const { key, rawKey } = await createWorkspaceApiKey(supabase as any, {
    workspaceId: body.workspace_id,
    name: body.name,
    integrator: body.integrator,
    scopes: body.scopes,
    createdByUserId: user.id,
    expiresAt: body.expires_at ?? null,
  });
  // The raw key is returned exactly once — only its hash is stored.
  return json({ data: { ...key, raw_key: rawKey } }, { status: 201 });
});

agentApiRouter.delete("/v1/agent/keys/:id", async (c) => {
  const workspaceId = new URL(c.req.url).searchParams.get("workspace_id");
  if (!workspaceId) throw new ApiError(400, "workspace_id is required", "missing_workspace");
  const { supabase } = await requireWorkspaceAuth(c, workspaceId, ADMIN_ROLES);
  const key = await revokeWorkspaceApiKey(supabase as any, workspaceId, c.req.param("id"));
  return json({ data: key });
});

// ---------------------------------------------------------------------------
// Agent REST surface (API key auth)
// ---------------------------------------------------------------------------

agentApiRouter.get("/v1/agent/catalog", async (c) => {
  const { db, ctx } = await withKey(c);
  assertWorkspaceMatch(ctx, claimedWorkspace(c));
  return json({ data: await svc.getCatalog(db, ctx) });
});

agentApiRouter.get("/v1/agent/booking-rules", async (c) => {
  const { db, ctx } = await withKey(c);
  assertWorkspaceMatch(ctx, claimedWorkspace(c));
  return json({ data: await svc.getBookingRules(db, ctx) });
});

const availabilitySchema = z.object({
  workspace_id: z.string().uuid().optional(),
  starts_at: z.string().datetime().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  service_catalog_id: z.string().uuid().optional(),
  duration_minutes: z.number().int().min(1).max(1440).optional(),
  service_lat: z.number().min(-90).max(90).nullable().optional(),
  service_lng: z.number().min(-180).max(180).nullable().optional(),
});

agentApiRouter.post("/v1/agent/availability", async (c) => {
  const body = availabilitySchema.parse(await c.req.json());
  const { db, ctx } = await withKey(c);
  assertWorkspaceMatch(ctx, body.workspace_id);
  return json({
    data: await svc.checkAvailability(db, ctx, {
      starts_at: body.starts_at,
      date: body.date,
      service_catalog_id: body.service_catalog_id,
      duration_minutes: body.duration_minutes,
      service_lat: body.service_lat ?? null,
      service_lng: body.service_lng ?? null,
    }),
  });
});

agentApiRouter.get("/v1/agent/appointments", async (c) => {
  const { db, ctx } = await withKey(c);
  assertWorkspaceMatch(ctx, claimedWorkspace(c));
  const url = new URL(c.req.url);
  return json({
    data: await svc.listAppointments(db, ctx, {
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      limit: Number(url.searchParams.get("limit")) || undefined,
      offset: Number(url.searchParams.get("offset")) || undefined,
    }),
  });
});

agentApiRouter.get("/v1/agent/appointments/:id", async (c) => {
  const { db, ctx } = await withKey(c);
  assertWorkspaceMatch(ctx, claimedWorkspace(c));
  return json({ data: await svc.getAppointment(db, ctx, c.req.param("id")) });
});

const createCustomerSchema = z.object({
  workspace_id: z.string().uuid().optional(),
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().max(100).optional(),
  company_name: z.string().trim().max(200).optional(),
  email: z.string().email().optional(),
  phone: z.string().trim().max(40).optional(),
  address_line1: z.string().trim().max(250).optional(),
  address_line2: z.string().trim().max(250).optional(),
  city: z.string().trim().max(120).optional(),
  region: z.string().trim().max(120).optional(),
  postal_code: z.string().trim().max(24).optional(),
  notes: z.string().max(5000).optional(),
});

agentApiRouter.post("/v1/agent/customers", async (c) => {
  const body = createCustomerSchema.parse(await c.req.json());
  const { db, ctx } = await withKey(c);
  assertWorkspaceMatch(ctx, body.workspace_id);
  const { workspace_id: _omit, ...customer } = body;
  return json({ data: await svc.createCustomer(db, ctx, customer) }, { status: 201 });
});

agentApiRouter.get("/v1/agent/customers", async (c) => {
  const { db, ctx } = await withKey(c);
  assertWorkspaceMatch(ctx, claimedWorkspace(c));
  const url = new URL(c.req.url);
  return json({
    data: await svc.listCustomers(db, ctx, {
      search: url.searchParams.get("search") ?? undefined,
      limit: Number(url.searchParams.get("limit")) || undefined,
      offset: Number(url.searchParams.get("offset")) || undefined,
    }),
  });
});

agentApiRouter.get("/v1/agent/customers/:id/history", async (c) => {
  const { db, ctx } = await withKey(c);
  assertWorkspaceMatch(ctx, claimedWorkspace(c));
  return json({ data: await svc.getCustomerHistory(db, ctx, c.req.param("id")) });
});

agentApiRouter.get("/v1/agent/vehicles", async (c) => {
  const { db, ctx } = await withKey(c);
  assertWorkspaceMatch(ctx, claimedWorkspace(c));
  const url = new URL(c.req.url);
  return json({
    data: await svc.listVehicles(db, ctx, {
      search: url.searchParams.get("search") ?? undefined,
      limit: Number(url.searchParams.get("limit")) || undefined,
      offset: Number(url.searchParams.get("offset")) || undefined,
    }),
  });
});

agentApiRouter.get("/v1/agent/locations", async (c) => {
  const { db, ctx } = await withKey(c);
  assertWorkspaceMatch(ctx, claimedWorkspace(c));
  return json({ data: await svc.listLocations(db, ctx) });
});

agentApiRouter.get("/v1/agent/invoices", async (c) => {
  const { db, ctx } = await withKey(c);
  assertWorkspaceMatch(ctx, claimedWorkspace(c));
  const url = new URL(c.req.url);
  return json({
    data: await svc.listInvoices(db, ctx, {
      status: url.searchParams.get("status") ?? undefined,
      limit: Number(url.searchParams.get("limit")) || undefined,
      offset: Number(url.searchParams.get("offset")) || undefined,
    }),
  });
});

const createBookingSchema = z.object({
  workspace_id: z.string().uuid().optional(),
  customer_id: z.string().uuid().optional(),
  customer: z
    .object({
      first_name: z.string().trim().min(1).max(100),
      last_name: z.string().trim().max(100).optional(),
      email: z.string().email().optional(),
      phone: z.string().trim().max(40).optional(),
      company_name: z.string().trim().max(200).optional(),
    })
    .optional(),
  vehicle_id: z.string().uuid().optional(),
  vehicle: z
    .object({
      year: z.number().int().min(1900).max(2100).optional(),
      make: z.string().trim().max(80).optional(),
      model: z.string().trim().max(80).optional(),
      vin: z.string().trim().max(32).optional(),
      license_plate: z.string().trim().max(24).optional(),
    })
    .optional(),
  service_catalog_id: z.string().uuid().optional(),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime().optional(),
  title: z.string().trim().max(200).optional(),
  notes: z.string().max(5000).optional(),
  location_address: z.string().trim().max(500).optional(),
  customer_city: z.string().trim().max(120).optional(),
  customer_state: z.string().trim().max(120).optional(),
  customer_postal_code: z.string().trim().max(24).optional(),
  service_lat: z.number().min(-90).max(90).nullable().optional(),
  service_lng: z.number().min(-180).max(180).nullable().optional(),
});

agentApiRouter.post("/v1/agent/bookings", async (c) => {
  const body = createBookingSchema.parse(await c.req.json());
  const { db, ctx } = await withKey(c);
  assertWorkspaceMatch(ctx, body.workspace_id);
  const { workspace_id: _omit, ...input } = body;
  return json({ data: await svc.createBooking(db, ctx, input) }, { status: 201 });
});

// ---------------------------------------------------------------------------
// MCP (Streamable HTTP, stateless) — same key auth, same service layer.
// ---------------------------------------------------------------------------

agentApiRouter.post("/mcp", async (c) => {
  const db = createSupabaseAdminClient();
  let message: unknown;
  try {
    message = await c.req.json();
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }
  const response = await handleMcpMessage(db, c.req.raw, message as any);
  if (response === null) return new Response(null, { status: 202 });
  return json(response as any);
});

agentApiRouter.get("/mcp", async (c) => {
  // Stateless server: no server-initiated SSE stream. Per the MCP spec a
  // server MAY answer GET with 405 when it offers no stream.
  return json(
    { error: { code: "method_not_allowed", message: "This MCP server is stateless; use POST with JSON-RPC messages." } },
    { status: 405 },
  );
});

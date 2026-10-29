/**
 * Website Bookings queue router — staff-only surface for selectively pushing
 * MOMS-website bookings into Service Writer (spec:
 * website-bookings-selective-push-spec.md).
 *
 * - GET  /v1/website-bookings/queue?workspace_id&status=unpushed|never_push|pushed
 * - POST /v1/website-bookings/prepare  { workspace_id, booking_ids }
 * - POST /v1/website-bookings/push     { workspace_id, decisions }
 * - POST /v1/website-bookings/never-push { workspace_id, booking_id, never_push }
 * - POST /internal/website-bookings/auto-push { booking_id }
 *   (server-to-server only, shared push secret — the prepaid auto-push
 *   added 2026-10-29; every staff route above is unchanged)
 *
 * Everything here is behind requireWorkspaceAuth with the same role list as
 * POST /v1/appointments. Creation happens only inside
 * public_booking_book_appointment_staff_v1 (the staff variant of the
 * canonical v3 create) — see src/server/website-bookings/service.ts.
 * The public booking routes are untouched by this router.
 */
import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { json } from "@/server/api";
import { requireWorkspaceAuth } from "@/server/hono/middleware/auth";
import { WebsiteBackendError } from "@/server/website-bookings/client";
import {
  executeAutoPush,
  executePushes,
  listWebsiteBookingsQueue,
  preparePushes,
  setNeverPush,
} from "@/server/website-bookings/service";

export const websiteBookingsRouter = new Hono();

const PUSH_ROLES = ["owner", "admin", "manager", "service_advisor", "receptionist", "dispatcher"] as const;

function backendErrorResponse(error: unknown) {
  if (error instanceof WebsiteBackendError) {
    return json(
      { error: { code: "website_backend_error", message: error.message } },
      { status: error.status >= 400 && error.status < 600 ? error.status : 502 },
    );
  }
  return null;
}

websiteBookingsRouter.get("/v1/website-bookings/queue", async (c: Context) => {
  const url = new URL(c.req.url);
  const workspaceId = url.searchParams.get("workspace_id");
  if (!workspaceId) throw new Error("workspace_id is required");
  const status = z
    .enum(["unpushed", "never_push", "pushed"])
    .catch("unpushed")
    .parse(url.searchParams.get("status") ?? "unpushed");
  await requireWorkspaceAuth(c, workspaceId, [...PUSH_ROLES]);
  try {
    const data = await listWebsiteBookingsQueue(status);
    return json({ data });
  } catch (error) {
    const response = backendErrorResponse(error);
    if (response) return response;
    throw error;
  }
});

const prepareSchema = z.object({
  workspace_id: z.string().uuid(),
  booking_ids: z.array(z.string().min(1)).min(1).max(50),
});

websiteBookingsRouter.post("/v1/website-bookings/prepare", async (c: Context) => {
  const body = prepareSchema.parse(await c.req.json());
  const { supabase } = await requireWorkspaceAuth(c, body.workspace_id, [...PUSH_ROLES]);
  try {
    const result = await preparePushes(supabase, body.workspace_id, body.booking_ids);
    return json({ data: result });
  } catch (error) {
    const response = backendErrorResponse(error);
    if (response) return response;
    throw error;
  }
});

const pushSchema = z.object({
  workspace_id: z.string().uuid(),
  decisions: z
    .array(
      z.object({
        booking_id: z.string().min(1),
        action: z.enum(["push", "link", "skip", "hold"]),
        link_appointment_id: z.string().uuid().nullable().optional(),
      }),
    )
    .min(1)
    .max(50),
});

websiteBookingsRouter.post("/v1/website-bookings/push", async (c: Context) => {
  const body = pushSchema.parse(await c.req.json());
  const { supabase } = await requireWorkspaceAuth(c, body.workspace_id, [...PUSH_ROLES]);
  try {
    const results = await executePushes(supabase, body.workspace_id, body.decisions);
    return json({ data: results });
  } catch (error) {
    const response = backendErrorResponse(error);
    if (response) return response;
    throw error;
  }
});

const autoPushSchema = z.object({
  booking_id: z.string().uuid(),
});

/**
 * POST /api/internal/website-bookings/auto-push — server-to-server only.
 *
 * The website backend calls this when a website booking's prepayment
 * completes (Stripe webhook). Auth is the shared push secret
 * (SW_PUSH_SECRET, the same secret Service Writer uses to call the
 * website backend's internal endpoints), compared in constant time.
 * There is no staff session: the push runs with the service-role client
 * through the SAME pipeline as the manual queue (executeAutoPush →
 * executePushes in auto_prepaid mode → the service-role variant of the
 * canonical staff create RPC, quote re-verified, booking stamped).
 *
 * The MOMS website maps to exactly one Service Writer workspace,
 * configured server-side as WEBSITE_BOOKINGS_WORKSPACE_ID — the caller
 * cannot choose a workspace. Unconfigured secret or workspace is an
 * honest 503, never a silent drop: the booking stays in the manual
 * queue either way.
 */
websiteBookingsRouter.post("/internal/website-bookings/auto-push", async (c: Context) => {
  const expected = (process.env.SW_PUSH_SECRET || "").trim();
  if (!expected) {
    return json(
      { error: { code: "auto_push_not_configured", message: "Auto-push is not configured on the server (SW_PUSH_SECRET must be set)." } },
      { status: 503 },
    );
  }
  const provided = c.req.header("x-sw-push-secret") ?? "";
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    return json({ error: { code: "unauthorized", message: "Invalid push secret." } }, { status: 401 });
  }

  const workspaceId = (process.env.WEBSITE_BOOKINGS_WORKSPACE_ID || "").trim();
  if (!z.string().uuid().safeParse(workspaceId).success) {
    return json(
      {
        error: {
          code: "auto_push_not_configured",
          message: "Auto-push is not configured on the server (WEBSITE_BOOKINGS_WORKSPACE_ID must be set to the MOMS workspace id).",
        },
      },
      { status: 503 },
    );
  }

  const body = autoPushSchema.parse(await c.req.json());
  try {
    const supabase = createSupabaseAdminClient();
    const result = await executeAutoPush(supabase, workspaceId, body.booking_id);
    return json({ data: result });
  } catch (error) {
    const response = backendErrorResponse(error);
    if (response) return response;
    throw error;
  }
});

const neverPushSchema = z.object({
  workspace_id: z.string().uuid(),
  booking_id: z.string().min(1),
  never_push: z.boolean(),
});

websiteBookingsRouter.post("/v1/website-bookings/never-push", async (c: Context) => {
  const body = neverPushSchema.parse(await c.req.json());
  await requireWorkspaceAuth(c, body.workspace_id, [...PUSH_ROLES]);
  try {
    await setNeverPush(body.booking_id, body.never_push);
    return json({ data: { booking_id: body.booking_id, never_push: body.never_push } });
  } catch (error) {
    const response = backendErrorResponse(error);
    if (response) return response;
    throw error;
  }
});

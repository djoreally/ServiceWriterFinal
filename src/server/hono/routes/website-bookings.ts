/**
 * Website Bookings queue router — staff-only surface for selectively pushing
 * MOMS-website bookings into Service Writer (spec:
 * website-bookings-selective-push-spec.md).
 *
 * - GET  /v1/website-bookings/queue?workspace_id&status=unpushed|never_push|pushed
 * - POST /v1/website-bookings/prepare  { workspace_id, booking_ids }
 * - POST /v1/website-bookings/push     { workspace_id, decisions }
 * - POST /v1/website-bookings/never-push { workspace_id, booking_id, never_push }
 *
 * Everything here is behind requireWorkspaceAuth with the same role list as
 * POST /v1/appointments. Creation happens only inside
 * public_booking_book_appointment_staff_v1 (the staff variant of the
 * canonical v3 create) — see src/server/website-bookings/service.ts.
 * The public booking routes are untouched by this router.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { json } from "@/server/api";
import { requireWorkspaceAuth } from "@/server/hono/middleware/auth";
import { WebsiteBackendError } from "@/server/website-bookings/client";
import {
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

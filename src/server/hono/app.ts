/**
 * Hono application factory (Phase 1 migration).
 *
 * Mounted at `app/api/[[...route]]/route.ts` via `handle` from `hono/vercel`.
 * Next.js gives precedence to specific `route.ts` files over the catch-all, so
 * this coexists safely with not-yet-migrated handlers during the migration.
 *
 * Conventions (must be preserved):
 * - `basePath("/api")` so routers register paths relative to `/api`.
 * - Global `onError` delegates to `errorResponse` from `@/server/api`,
 *   preserving the exact `{ error: { code, message } }` JSON shape, status
 *   codes, and CORS headers of the original handlers.
 * - Global `OPTIONS *` returns 204 with the same CORS headers the original
 *   `json()` helper sets, so preflight behavior is unchanged.
 */
import { Hono } from "hono";
import { corsHeaders, errorResponse } from "@/server/api";
import { appointmentsRouter } from "./routes/appointments";
import { billingRouter } from "./routes/billing";
import { catalogRouter } from "./routes/catalog";
import { crmRouter } from "./routes/crm";
import { documentsRouter } from "./routes/documents";
import { messagingRouter } from "./routes/messaging";
import { platformRouter } from "./routes/platform";
import { vehiclesRouter } from "./routes/vehicles";
import { workOrdersRouter } from "./routes/work-orders";

export function createHonoApp(): Hono {
  const app = new Hono().basePath("/api");

  // Preserve the exact error contract of the original route handlers.
  app.onError((error) => errorResponse(error));

  // CORS preflight: mirror the headers the original `json()` helper sets.
  app.options("*", () => new Response(null, { status: 204, headers: corsHeaders() }));

  // ---------------------------------------------------------------------------
  // Domain routers. Each router registers paths relative to `/api` (the
  // basePath above); `app.route("/", router)` merges them unchanged, so
  // `/v1/appointments/:id` on the router serves `/api/v1/appointments/:id`.
  // ---------------------------------------------------------------------------
  app.route("/", appointmentsRouter);
  app.route("/", billingRouter);
  app.route("/", catalogRouter);
  app.route("/", crmRouter);
  app.route("/", documentsRouter);
  app.route("/", messagingRouter);
  app.route("/", platformRouter);
  app.route("/", vehiclesRouter);
  app.route("/", workOrdersRouter);

  return app;
}

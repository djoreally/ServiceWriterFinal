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
 * - A global middleware normalizes non-`Error` throws (PostgREST returns
 *   plain-object errors) via `toError` so `onError` — and the P0001 mapping —
 *   actually runs for every route.
 * - Global `OPTIONS *` returns 204 with the same CORS headers the original
 *   `json()` helper sets, so preflight behavior is unchanged.
 */
import { Hono } from "hono";
import { corsHeaders, errorResponse, toError } from "@/server/api";
import { initSentry } from "@/server/sentry";
import { agentApiRouter } from "./routes/agent-api";
import { appointmentsRouter } from "./routes/appointments";
import { billingRouter } from "./routes/billing";
import { catalogRouter } from "./routes/catalog";
import { crmRouter } from "./routes/crm";
import { documentsRouter } from "./routes/documents";
import { messagingRouter } from "./routes/messaging";
import { platformRouter } from "./routes/platform";
import { publicBookingRouter } from "./routes/public-booking";
import { vehiclesRouter } from "./routes/vehicles";
import { websiteBookingsRouter } from "./routes/website-bookings";
import { workOrdersRouter } from "./routes/work-orders";

export function createHonoApp(): Hono {
  // Server boot: initialize Sentry once (no-op when SENTRY_DSN is unset).
  initSentry();

  const app = new Hono().basePath("/api");

  // Deliberate-error probe for the Sentry wiring proof. Registered ONLY
  // when SENTRY_TEST=1 is set in the environment — it cannot fire in
  // production by accident, and the route does not exist otherwise.
  if (process.env.SENTRY_TEST === "1") {
    app.get("/v1/__sentry-test", () => {
      throw new Error("Sentry wiring test error (deliberate)");
    });
  }

  // Preserve the exact error contract of the original route handlers.
  // The request context (route, method, workspace id when the request
  // carried one) rides along so 5xx captures in errorResponse are useful;
  // it never changes the response shape.
  app.onError((error, c) =>
    errorResponse(error, {
      route: c.req.path,
      method: c.req.method,
      workspaceId: c.req.query("workspace_id"),
    }),
  );

  // Hono only routes `instanceof Error` throws to onError. PostgREST errors
  // are plain objects, so without this a route's `if (error) throw error`
  // would bypass errorResponse (and the P0001 mapping) and surface as a bare
  // 500. Normalize here so every route keeps the honest-error contract.
  app.use(async (_c, next) => {
    try {
      await next();
    } catch (e) {
      throw toError(e);
    }
  });

  // CORS preflight: mirror the headers the original `json()` helper sets.
  app.options("*", () => new Response(null, { status: 204, headers: corsHeaders() }));

  // ---------------------------------------------------------------------------
  // Domain routers. Each router registers paths relative to `/api` (the
  // basePath above); `app.route("/", router)` merges them unchanged, so
  // `/v1/appointments/:id` on the router serves `/api/v1/appointments/:id`.
  // ---------------------------------------------------------------------------
  app.route("/", publicBookingRouter);
  app.route("/", agentApiRouter);
  app.route("/", appointmentsRouter);
  app.route("/", billingRouter);
  app.route("/", catalogRouter);
  app.route("/", crmRouter);
  app.route("/", documentsRouter);
  app.route("/", messagingRouter);
  app.route("/", platformRouter);
  app.route("/", vehiclesRouter);
  app.route("/", websiteBookingsRouter);
  app.route("/", workOrdersRouter);

  return app;
}

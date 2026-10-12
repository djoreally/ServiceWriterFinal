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
import { corsHeaders, errorResponse, json, toError } from "@/server/api";
import { appointmentsRouter } from "./routes/appointments";
import { billingRouter } from "./routes/billing";
import { catalogRouter } from "./routes/catalog";
import { crmRouter } from "./routes/crm";
import { documentsRouter } from "./routes/documents";
import { messagingRouter } from "./routes/messaging";
import { platformRouter } from "./routes/platform";
import { publicBookingRouter } from "./routes/public-booking";
import { publicBookingTaxRouter } from "./routes/public-booking-tax";
import { vehiclesRouter } from "./routes/vehicles";
import { workOrdersRouter } from "./routes/work-orders";

export function createHonoApp(): Hono {
  const app = new Hono().basePath("/api");

  // Preserve the exact error contract of the original route handlers.
  app.onError((error) => errorResponse(error));

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

  // REG-017 containment: public Pay Now previously proxied to Supabase Edge
  // Functions that do not exist in production. Fail closed before billingRouter
  // is mounted so a customer is never sent into a phantom checkout path. This
  // guard is temporary until the canonical appointment-hold -> Stripe Checkout
  // -> webhook reconciliation flow is certified and replaces it.
  app.post("/v1/billing/public-checkout", () => json({
    error: {
      code: "public_checkout_unavailable",
      message: "Online Stripe/Square payment checkout is not enabled right now. Please choose \"Pay at Time of Service\" to complete your booking.",
    },
  }, { status: 503 }));

  // ---------------------------------------------------------------------------
  // Domain routers. Each router registers paths relative to `/api` (the
  // basePath above); `app.route("/", router)` merges them unchanged, so
  // `/v1/appointments/:id` on the router serves `/api/v1/appointments/:id`.
  // ---------------------------------------------------------------------------
  app.route("/", publicBookingRouter);
  // REG-018: native tax must be registered before platformRouter, whose legacy
  // calculate-tax handler still points to a retired Edge Function.
  app.route("/", publicBookingTaxRouter);
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
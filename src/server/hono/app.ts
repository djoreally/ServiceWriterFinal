/**
 * Hono application factory (Phase 1 migration).
 *
 * Mounted at app/api/[[...route]]/route.ts via handle from hono/vercel.
 * Next.js gives precedence to specific route.ts files over the catch-all, so
 * this coexists safely with not-yet-migrated handlers during the migration.
 */
import { Hono } from "hono";
import { corsHeaders, errorResponse, toError } from "@/server/api";
import { appointmentsRouter } from "./routes/appointments";
import { billingRouter } from "./routes/billing";
import { catalogRouter } from "./routes/catalog";
import { crmRouter } from "./routes/crm";
import { documentsRouter } from "./routes/documents";
import { messagingRouter } from "./routes/messaging";
import { momsBookingSyncRouter } from "./routes/moms-booking-sync";
import { platformRouter } from "./routes/platform";
import { publicBookingRouter } from "./routes/public-booking";
import { vehiclesRouter } from "./routes/vehicles";
import { workOrdersRouter } from "./routes/work-orders";

export function createHonoApp(): Hono {
  const app = new Hono().basePath("/api");

  app.onError((error) => errorResponse(error));

  app.use(async (_c, next) => {
    try {
      await next();
    } catch (e) {
      throw toError(e);
    }
  });

  app.options("*", () => new Response(null, { status: 204, headers: corsHeaders() }));

  app.route("/", publicBookingRouter);
  app.route("/", momsBookingSyncRouter);
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

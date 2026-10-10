/**
 * Wraps a domain router for isolated testing with the same error contract
 * the composed app provides: `app.ts` registers a global `onError` that
 * delegates to `errorResponse` from `@/server/api`, plus a middleware that
 * normalizes non-`Error` throws (PostgREST plain-object errors) via `toError`
 * so `onError` — and the P0001 mapping — actually runs. Individual routers
 * carry neither, so without this, thrown ApiErrors would surface as Hono's
 * default 500 text and thrown PostgREST objects would escape entirely,
 * instead of the `{ error: { code, message } }` contract.
 *
 * The middleware must wrap the router (fresh parent app + `route()`), not be
 * appended to it: Hono only applies `use()` middleware to routes registered
 * after it, and the router's routes already exist by the time this runs.
 *
 * (In the composed-app tests, `createHonoApp()` provides this natively.)
 */
import { Hono } from "hono";
import { errorResponse, toError } from "@/server/api";

export function testRouter(router: Hono): Hono {
  const app = new Hono();
  app.onError((err) => errorResponse(err as Error));
  app.use(async (_c, next) => {
    try {
      await next();
    } catch (e) {
      throw toError(e);
    }
  });
  app.route("/", router);
  return app;
}

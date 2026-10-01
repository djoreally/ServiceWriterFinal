/**
 * Wraps a domain router for isolated testing with the same error contract
 * the composed app provides: `app.ts` registers a global `onError` that
 * delegates to `errorResponse` from `@/server/api`. Individual routers do
 * not carry that handler, so without this, thrown ApiErrors would surface
 * as Hono's default 500 text instead of `{ error: { code, message } }`.
 *
 * (In the composed-app tests, `createHonoApp()` provides this natively.)
 */
import { errorResponse } from "@/server/api";
import type { Hono } from "hono";

export function testRouter<T extends Hono>(router: T): T {
  router.onError((err) => errorResponse(err as Error));
  return router;
}

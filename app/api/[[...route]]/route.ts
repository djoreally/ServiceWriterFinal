/**
 * Hono API mount (Phase 1 migration).
 *
 * Forwards all otherwise-unmatched `/api/*` requests to the Hono application.
 * Next.js routing gives precedence to specific route.ts files
 * over this catch-all, so migrated Hono routers and not-yet-migrated
 * route handlers coexist safely: as each domain's old `route.ts` files are
 * removed, the identical paths are served by the Hono routers instead.
 */
import { handle } from "hono/vercel";
import { createHonoApp } from "@/server/hono/app";

export const runtime = "nodejs";

const app = createHonoApp();

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
export const OPTIONS = handle(app);

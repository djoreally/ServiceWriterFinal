import { handle } from "hono/vercel";
import { createHonoApp } from "@/server/hono/app";

export const runtime = "nodejs";

// This explicit route must exist because Next.js gives
// app/api/v1/service-records/[id]/route.ts precedence over the global API
// catch-all. Without it, `page` is interpreted as a service-record id and
// GET fails UUID validation ("Invalid UUID") before the Hono router —
// which registers GET /v1/service-records/page — can handle the request.
export const GET = handle(createHonoApp());

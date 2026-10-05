import { handle } from "hono/vercel";
import { createHonoApp } from "@/server/hono/app";

export const runtime = "nodejs";

// This explicit route must exist because Next.js gives
// app/api/v1/appointments/[id]/route.ts precedence over the global API
// catch-all. Without it, `booking-progress` is interpreted as an appointment
// id and POST returns 405 before the Hono router can handle the request.
export const POST = handle(createHonoApp());

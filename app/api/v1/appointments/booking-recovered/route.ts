import { handle } from "hono/vercel";
import { createHonoApp } from "@/server/hono/app";

export const runtime = "nodejs";

// Keep this explicit route alongside booking-progress. The dynamic
// appointments/[id] route otherwise captures `booking-recovered` before the
// global Hono catch-all and rejects POST with 405.
export const POST = handle(createHonoApp());

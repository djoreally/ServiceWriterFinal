import { handle } from "hono/vercel";
import { createHonoApp } from "@/server/hono/app";

export const runtime = "nodejs";

// The legacy app/api/v1/appointments/[id]/route.ts outranks the global Hono
// catch-all. Keep this static route explicit so public booking RPC writes reach
// the appointments-domain handler instead of being rejected as POST-to-[id].
export const POST = handle(createHonoApp());

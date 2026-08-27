import { NextResponse } from "next/server";
import { processInAppNotificationPushOutbox } from "@/server/notifications/push-outbox";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authorization = request.headers.get("authorization");
  const supplied = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : request.headers.get("x-lifecycle-worker-secret");
  return supplied === secret;
}

async function processPushOutboxRequest(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({})) as { limit?: number };
    const limit = Number.isFinite(body.limit) ? Math.max(1, Math.min(Number(body.limit), 200)) : 50;
    const result = await processInAppNotificationPushOutbox(limit);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[Push] outbox worker failed", error);
    return NextResponse.json({ ok: false, error: "worker_failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return processPushOutboxRequest(request);
}

export async function GET(request: Request) {
  return processPushOutboxRequest(request);
}

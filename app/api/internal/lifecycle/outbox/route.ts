import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processLifecycleEventOutbox } from "@/server/messaging/lifecycle-sender";

export const runtime = "nodejs";
export const maxDuration = 60;

function suppliedSecret(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  return authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : request.headers.get("x-lifecycle-worker-secret");
}

function authorized(request: Request, secret: string): boolean {
  const supplied = suppliedSecret(request);
  if (!supplied) return false;
  const expectedBuffer = Buffer.from(secret);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

function safeErrorDetails(error: unknown): { errorCode: string; errorMessage: string } {
  if (error instanceof Error) {
    return {
      errorCode: error.name || "Error",
      errorMessage: error.message.slice(0, 300),
    };
  }
  if (error && typeof error === "object") {
    const candidate = error as { code?: unknown; message?: unknown };
    return {
      errorCode: typeof candidate.code === "string" ? candidate.code.slice(0, 80) : "worker_error",
      errorMessage: typeof candidate.message === "string" ? candidate.message.slice(0, 300) : "Unknown worker error",
    };
  }
  return { errorCode: "worker_error", errorMessage: "Unknown worker error" };
}

async function processLifecycleOutboxRequest(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.error("[Lifecycle] outbox worker disabled: CRON_SECRET is not configured");
    return NextResponse.json({ ok: false, error: "worker_not_configured" }, { status: 503 });
  }
  if (!authorized(request, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const body = await request.json().catch(() => ({})) as { limit?: number };
    const limit = Number.isFinite(body.limit) ? Math.max(1, Math.min(Number(body.limit), 50)) : 10;
    const result = await processLifecycleEventOutbox(limit);
    return NextResponse.json({ ok: true, ...result, durationMs: Date.now() - startedAt });
  } catch (error) {
    console.error("[Lifecycle] outbox worker failed", safeErrorDetails(error));
    return NextResponse.json({ ok: false, error: "worker_failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return processLifecycleOutboxRequest(request);
}

export async function GET(request: Request) {
  return processLifecycleOutboxRequest(request);
}

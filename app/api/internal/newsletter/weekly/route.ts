import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processDueNewsletterSubscribers } from "@/server/messaging/newsletter";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request: Request, secret: string) {
  const header = request.headers.get("authorization");
  const supplied = header?.startsWith("Bearer ") ? header.slice(7) : request.headers.get("x-newsletter-worker-secret");
  if (!supplied) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ ok: false, error: "worker_not_configured" }, { status: 503 });
  if (!authorized(request, secret)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const result = await processDueNewsletterSubscribers(25);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[Newsletter] weekly worker failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ ok: false, error: "worker_failed" }, { status: 500 });
  }
}

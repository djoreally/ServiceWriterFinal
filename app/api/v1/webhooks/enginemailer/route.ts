import { NextResponse } from "next/server";
import { EnginemailerEmailAdapter } from "@/server/messaging/enginemailer";
import { ingestDeliveryWebhook } from "@/server/messaging/webhook";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = request.headers.get("x-vercel-id") ?? request.headers.get("x-request-id") ?? crypto.randomUUID();
  try {
    const rawBody = await request.text();
    const result = await ingestDeliveryWebhook(
      "enginemailer",
      new EnginemailerEmailAdapter(),
      request,
      rawBody,
    );
    if (!result.accepted) return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    return NextResponse.json({ ok: true, accepted: result.count, duplicate: result.duplicate });
  } catch (error) {
    const details = error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack?.split("\n").slice(0, 4).join("\n") }
      : { name: typeof error, message: "Non-Error exception thrown" };
    console.error("enginemailer_webhook_failed", {
      requestId,
      route: "/api/v1/webhooks/enginemailer",
      provider: "enginemailer",
      ...details,
    });
    return NextResponse.json({ error: "Webhook processing failed", requestId }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { TwilioSmsAdapter } from "@/server/messaging/twilio";
import { ingestDeliveryWebhook, ingestInboundWebhook } from "@/server/messaging/webhook";

export const runtime = "nodejs";

async function handle(request: Request, inbound: boolean) {
  const rawBody = await request.text();
  try {
    const adapter = new TwilioSmsAdapter();
    const result = inbound
      ? await ingestInboundWebhook("twilio", adapter, request, rawBody)
      : await ingestDeliveryWebhook("twilio", adapter, request, rawBody);
    if (!result.accepted) return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    return NextResponse.json({ ok: true, accepted: result.count, duplicate: result.duplicate });
  } catch (error) {
    console.error("twilio_webhook_failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return handle(request, false);
}

export async function PUT(request: Request) {
  return handle(request, true);
}

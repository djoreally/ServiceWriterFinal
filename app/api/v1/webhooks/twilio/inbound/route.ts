import { NextResponse } from "next/server";
import { TwilioSmsAdapter } from "@/server/messaging/twilio";
import { ingestInboundWebhook } from "@/server/messaging/webhook";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  try {
    const result = await ingestInboundWebhook("twilio", new TwilioSmsAdapter(), request, rawBody);
    if (!result.accepted) return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    return NextResponse.json({ ok: true, accepted: result.count, duplicate: result.duplicate });
  } catch (error) {
    console.error("twilio_inbound_webhook_failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

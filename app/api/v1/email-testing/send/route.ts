import { z } from "zod";
import { errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { EnginemailerEmailAdapter } from "@/server/messaging/enginemailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  workspace_id: z.string().uuid(),
  to: z.string().email().max(320),
  type: z.string().trim().max(80).default("enginemailer_test"),
  customerName: z.string().trim().max(160).optional(),
  businessName: z.string().trim().max(160).optional(),
  businessEmail: z.string().email().max(320).optional(),
  serviceName: z.string().trim().max(200).optional(),
  scheduledDate: z.string().trim().max(120).optional(),
  scheduledTime: z.string().trim().max(80).optional(),
  totalAmount: z.string().trim().max(80).optional(),
  vehicleInfo: z.string().trim().max(200).optional(),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    await requireWorkspaceMember(
      body.workspace_id,
      ["owner", "admin", "manager", "service_advisor", "receptionist", "dispatcher"],
      request,
    );

    const subject = `ServiceWriter Enginemailer test — ${body.type}`;
    const lines = [
      `This is a controlled Enginemailer test from ${body.businessName ?? "ServiceWriter"}.`,
      body.customerName ? `Customer: ${body.customerName}` : null,
      body.serviceName ? `Service: ${body.serviceName}` : null,
      body.vehicleInfo ? `Vehicle: ${body.vehicleInfo}` : null,
      body.scheduledDate || body.scheduledTime ? `Schedule: ${[body.scheduledDate, body.scheduledTime].filter(Boolean).join(" ")}` : null,
      body.totalAmount ? `Amount: ${body.totalAmount}` : null,
      "Provider: Enginemailer",
    ].filter(Boolean) as string[];
    const text = lines.join("\n");
    const html = `<p>${lines.map((line) => line.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")).join("</p><p>")}</p>`;

    const sent = await new EnginemailerEmailAdapter().send({
      workspaceId: body.workspace_id,
      recipient: { email: body.to.trim().toLowerCase() },
      purpose: "marketing",
      templateKey: `email_testing.${body.type}`,
      subject,
      body: text,
      html,
      fromName: body.businessName ?? "ServiceWriter",
      replyTo: body.businessEmail,
      idempotencyKey: `enginemailer-test:${body.workspace_id}:${crypto.randomUUID()}`,
      metadata: { source: "email_testing", provider_requested: "enginemailer" },
    });

    return json({
      success: true,
      provider: sent.providerName,
      status: sent.status,
      providerMessageId: sent.providerMessageId,
      acceptedAt: sent.acceptedAt,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

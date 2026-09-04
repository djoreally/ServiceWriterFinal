import { z } from "zod";
import { errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { ResendEmailAdapter } from "@/server/messaging/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  workspace_id: z.string().uuid(),
  to: z.string().email().max(320),
  type: z.string().trim().max(80).default("transactional_test"),
  customerName: z.string().trim().max(160).optional(),
  businessName: z.string().trim().max(160).optional(),
  businessEmail: z.string().email().max(320).optional(),
  serviceName: z.string().trim().max(200).optional(),
  scheduledDate: z.string().trim().max(120).optional(),
  scheduledTime: z.string().trim().max(80).optional(),
  totalAmount: z.string().trim().max(80).optional(),
  vehicleInfo: z.string().trim().max(200).optional(),
});

function safeType(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    await requireWorkspaceMember(
      body.workspace_id,
      ["owner", "admin", "manager", "service_advisor", "receptionist", "dispatcher"],
      request,
    );

    const type = safeType(body.type);
    const subject = `ServiceWriter transactional test — ${type}`;
    const lines = [
      `This is a controlled transactional email test from ${body.businessName ?? "ServiceWriter"}.`,
      body.customerName ? `Customer: ${body.customerName}` : null,
      body.serviceName ? `Service: ${body.serviceName}` : null,
      body.vehicleInfo ? `Vehicle: ${body.vehicleInfo}` : null,
      body.scheduledDate || body.scheduledTime
        ? `Schedule: ${[body.scheduledDate, body.scheduledTime].filter(Boolean).join(" ")}`
        : null,
      body.totalAmount ? `Amount: ${body.totalAmount}` : null,
      "Provider: Resend",
    ].filter(Boolean) as string[];

    const bodyText = lines.join("\n");
    const html = `<p>${lines.map(escapeHtml).join("</p><p>")}</p>`;
    const adapter = new ResendEmailAdapter();
    const delivery = await adapter.send({
      workspaceId: body.workspace_id,
      recipient: { email: body.to.trim().toLowerCase() },
      purpose: "transactional",
      templateKey: `email_testing.${type}`,
      subject,
      body: bodyText,
      html,
      fromName: body.businessName ?? "ServiceWriter",
      replyTo: body.businessEmail,
      idempotencyKey: `email-test:${body.workspace_id}:${crypto.randomUUID()}`,
      metadata: { source: "email_testing" },
    });

    return json({
      success: true,
      provider: delivery.providerName,
      status: delivery.status,
      providerMessageId: delivery.providerMessageId,
      acceptedAt: delivery.acceptedAt,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

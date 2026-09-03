import { z } from "zod";
import { errorResponse, json, requireWorkspaceMember } from "@/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENGINEMAILER_TRANSACTIONAL_API_URL = "https://api.enginemailer.com/RESTAPI/V2/Submission/SendEmail";

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

type EnginemailerResponse = {
  Result?: {
    TransactionID?: string;
    Status?: string;
    StatusCode?: string | number;
    ErrorMessage?: string;
  };
  message?: string;
};

function requiredEnv(names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`Missing required environment variable: ${names.join(" or ")}`);
}

function safeType(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
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
    const subject = `ServiceWriter Enginemailer test — ${type}`;
    const lines = [
      `This is a controlled Enginemailer test from ${body.businessName ?? "ServiceWriter"}.`,
      body.customerName ? `Customer: ${body.customerName}` : null,
      body.serviceName ? `Service: ${body.serviceName}` : null,
      body.vehicleInfo ? `Vehicle: ${body.vehicleInfo}` : null,
      body.scheduledDate || body.scheduledTime ? `Schedule: ${[body.scheduledDate, body.scheduledTime].filter(Boolean).join(" ")}` : null,
      body.totalAmount ? `Amount: ${body.totalAmount}` : null,
      "Provider: Enginemailer",
    ].filter(Boolean) as string[];
    const html = `<p>${lines.map((line) => line.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")).join("</p><p>")}</p>`;

    const apiKey = requiredEnv(["ENGINEMAILER_TRANSACTIONAL_API_KEY", "ENGINEMAILER_API_KEY"]);
    const senderEmail = requiredEnv(["ENGINEMAILER_TRANSACTIONAL_FROM_EMAIL", "ENGINEMAILER_FROM_EMAIL"]);

    const providerResponse = await fetch(ENGINEMAILER_TRANSACTIONAL_API_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        APIKey: apiKey,
      },
      body: JSON.stringify({
        CampaignName: `email_testing.${type}`,
        ToEmail: body.to.trim().toLowerCase(),
        Subject: subject,
        SenderEmail: senderEmail,
        SubmittedContent: html,
        SenderName: body.businessName ?? "ServiceWriter",
        SubstitutionTags: [],
      }),
    });

    const payload = await providerResponse.json().catch(() => ({})) as EnginemailerResponse;
    const statusCode = Number(payload.Result?.StatusCode ?? providerResponse.status);
    const transactionId = payload.Result?.TransactionID?.trim();

    if (!providerResponse.ok || statusCode !== 200 || !transactionId) {
      const detail = payload.Result?.ErrorMessage
        ?? payload.message
        ?? `Enginemailer did not confirm the submission (HTTP ${providerResponse.status}, provider status ${String(payload.Result?.StatusCode ?? "missing")}, transaction ID ${transactionId ? "present" : "missing"})`;
      throw new Error(detail.slice(0, 500));
    }

    return json({
      success: true,
      provider: "enginemailer",
      status: payload.Result?.Status ?? "OK",
      providerMessageId: transactionId,
      acceptedAt: new Date().toISOString(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

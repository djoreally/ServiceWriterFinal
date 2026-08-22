import { ResendEmailAdapter } from "@/server/messaging/resend";
import type { ProviderSendResult } from "@/server/messaging/types";

function requiredAppUrl(): string {
  const value = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!value) throw new Error("Missing required environment variable: NEXT_PUBLIC_APP_URL");
  return value.replace(/\/$/, "");
}

export async function sendInvitationEmail(input: {
  invitationId: string;
  workspaceId: string;
  recipientEmail: string;
  role: string;
  token: string;
  expiresAt: string;
}): Promise<ProviderSendResult> {
  const url = new URL(`/team/join?invitation_id=${encodeURIComponent(input.invitationId)}&token=${encodeURIComponent(input.token)}`, `${requiredAppUrl()}/`);
  const body = [
    "You have been invited to Service Writer.",
    "",
    `Role: ${input.role.replaceAll("_", " ")}`,
    `Accept your invitation: ${url.toString()}`,
    "",
    `This invitation expires on ${new Date(input.expiresAt).toLocaleString("en-US", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" })} UTC.`,
    "If you were not expecting this invitation, you can safely ignore this email.",
  ].join("\n");
  return new ResendEmailAdapter().send({
    workspaceId: input.workspaceId,
    recipient: { email: input.recipientEmail },
    purpose: "authentication",
    templateKey: "workspace_invitation",
    subject: "You have been invited to Service Writer",
    body,
    idempotencyKey: `invitation:${input.invitationId}:${input.token.slice(0, 16)}`,
    metadata: { invitationId: input.invitationId, role: input.role },
  });
}

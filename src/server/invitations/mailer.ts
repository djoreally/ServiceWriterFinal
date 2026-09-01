import { ResendEmailAdapter } from "@/server/messaging/resend";
import type { ProviderSendResult } from "@/server/messaging/types";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { LIFECYCLE_EVENT_KEYS } from "@/server/messaging/lifecycle-events";
import { renderLifecycleEmail } from "@/server/messaging/lifecycle-templates";

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
  const admin = createSupabaseAdminClient();
  const { data: workspace } = await admin.from("workspaces").select("name").eq("id", input.workspaceId).single();
  const workspaceName = workspace?.name ?? "Service Writer";
  const rendered = renderLifecycleEmail(LIFECYCLE_EVENT_KEYS.staffInvited, {
    "business.name": workspaceName,
    "workspace.name": workspaceName,
    "staff.role": input.role.replaceAll("_", " "),
    "invitation.expires_at": new Date(input.expiresAt).toLocaleString("en-US", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" }),
    "email.recipient_role": "staff",
    "email.primary_action_url": url.toString(),
  });
  return new ResendEmailAdapter().send({
    workspaceId: input.workspaceId,
    recipient: { email: input.recipientEmail },
    purpose: "authentication",
    templateKey: rendered.templateKey,
    subject: rendered.subject,
    body: rendered.text,
    html: rendered.html,
    fromName: workspaceName,
    idempotencyKey: `invitation:${input.invitationId}:${input.token.slice(0, 16)}`,
    metadata: { invitationId: input.invitationId, role: input.role },
  });
}

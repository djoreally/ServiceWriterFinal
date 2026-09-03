import type { ProviderSendResult } from "@/server/messaging/types";
import { ResendEmailAdapter } from "@/server/messaging/resend";
import { createSupabaseAdminClient } from "@/lib/supabase";

const CANONICAL_PRODUCTION_APP_URL = "https://servicewriter.xyz";

function requiredAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const vercelUrl = process.env.VERCEL_URL?.trim();
  const value = configured
    || (process.env.VERCEL_ENV === "production" ? CANONICAL_PRODUCTION_APP_URL : vercelUrl ? `https://${vercelUrl}` : CANONICAL_PRODUCTION_APP_URL);

  const url = new URL(value);
  if ((process.env.NODE_ENV === "production" || process.env.VERCEL_ENV) && url.protocol !== "https:") {
    throw new Error("Invitation app URL must use HTTPS outside local development");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Invitation app URL must use HTTP or HTTPS");
  }

  return url.toString().replace(/\/$/, "");
}

function invitationRedirect(input: { invitationId: string; token: string }): string {
  return new URL(
    `/team/join?invitation_id=${encodeURIComponent(input.invitationId)}&token=${encodeURIComponent(input.token)}`,
    `${requiredAppUrl()}/`,
  ).toString();
}

async function generateAuthActionLink(input: {
  email: string;
  redirectTo: string;
  metadata: Record<string, string>;
}): Promise<string> {
  const admin = createSupabaseAdminClient();
  const invited = await admin.auth.admin.generateLink({
    type: "invite",
    email: input.email,
    options: { redirectTo: input.redirectTo, data: input.metadata },
  });

  if (!invited.error && invited.data.properties?.action_link) {
    return invited.data.properties.action_link;
  }

  const existingUser = Boolean(invited.error && /already|registered|exists/i.test(invited.error.message));
  if (!existingUser) {
    throw new Error(`Supabase Auth invitation link generation failed: ${invited.error?.message || "No action link returned"}`);
  }

  const magicLink = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: input.email,
    options: { redirectTo: input.redirectTo, data: input.metadata },
  });
  if (magicLink.error || !magicLink.data.properties?.action_link) {
    throw new Error(`Supabase Auth magic-link generation failed: ${magicLink.error?.message || "No action link returned"}`);
  }
  return magicLink.data.properties.action_link;
}

export async function sendInvitationEmail(input: {
  invitationId: string;
  workspaceId: string;
  recipientEmail: string;
  role: string;
  token: string;
  expiresAt: string;
}): Promise<ProviderSendResult> {
  const redirectTo = invitationRedirect(input);
  const metadata = {
    servicewriter_invitation_id: input.invitationId,
    servicewriter_workspace_id: input.workspaceId,
    servicewriter_role: input.role,
    servicewriter_invitation_expires_at: input.expiresAt,
  };
  const actionLink = await generateAuthActionLink({
    email: input.recipientEmail,
    redirectTo,
    metadata,
  });

  const roleLabel = input.role.replaceAll("_", " ");
  const expires = new Date(input.expiresAt).toLocaleString("en-US", { timeZone: "America/New_York" });
  const text = `You have been invited to Service Writer as ${roleLabel}. Open this secure invitation link to sign in and join the workspace: ${actionLink}\n\nThis invitation expires ${expires}.`;
  const html = `<p>You have been invited to <strong>Service Writer</strong> as ${roleLabel}.</p><p><a href="${actionLink}">Accept invitation</a></p><p>This secure invitation expires ${expires}.</p>`;

  return new ResendEmailAdapter().send({
    workspaceId: input.workspaceId,
    recipient: { email: input.recipientEmail },
    purpose: "authentication",
    templateKey: "workspace_invitation",
    subject: "You’re invited to Service Writer",
    body: text,
    html,
    fromName: "Service Writer",
    idempotencyKey: `workspace-invitation:${input.invitationId}`,
    metadata: {
      invitationId: input.invitationId,
      role: input.role,
      authProvider: "supabase",
    },
  });
}

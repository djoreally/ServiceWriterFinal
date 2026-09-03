import type { ProviderSendResult } from "@/server/messaging/types";
import { createSupabaseAdminClient } from "@/lib/supabase";

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
  const redirectTo = new URL(
    `/team/join?invitation_id=${encodeURIComponent(input.invitationId)}&token=${encodeURIComponent(input.token)}`,
    `${requiredAppUrl()}/`,
  ).toString();

  const admin = createSupabaseAdminClient();
  const metadata = {
    servicewriter_invitation_id: input.invitationId,
    servicewriter_workspace_id: input.workspaceId,
    servicewriter_role: input.role,
    servicewriter_invitation_expires_at: input.expiresAt,
  };

  const invited = await admin.auth.admin.inviteUserByEmail(input.recipientEmail, {
    redirectTo,
    data: metadata,
  });

  if (!invited.error) {
    return {
      providerName: "supabase_auth",
      providerMessageId: invited.data.user?.id ? `supabase-auth-user:${invited.data.user.id}` : `supabase-auth-invite:${input.invitationId}`,
      status: "accepted",
      acceptedAt: new Date().toISOString(),
    };
  }

  const existingUser = /already|registered|exists/i.test(invited.error.message);
  if (!existingUser) {
    throw new Error(`Supabase Auth invitation failed: ${invited.error.message}`);
  }

  const magicLink = await admin.auth.signInWithOtp({
    email: input.recipientEmail,
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: false,
      data: metadata,
    },
  });

  if (magicLink.error) {
    throw new Error(`Supabase Auth invitation failed: ${magicLink.error.message}`);
  }

  return {
    providerName: "supabase_auth",
    providerMessageId: `supabase-auth-magic-link:${input.invitationId}`,
    status: "accepted",
    acceptedAt: new Date().toISOString(),
  };
}

/**
 * Email Settings Commands — Write operations for email configuration.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export async function saveEmailSettings(payload: Record<string, unknown>) {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");
  const { data: workspaceOwnerId, error: ownerError } = await supabase.rpc("current_workspace_owner_user_id");
  if (ownerError) throw ownerError;
  const settingsUserId = workspaceOwnerId || user.id;

  const { data: existing } = await (supabase as any)
    .from("email_settings")
    .select("id")
    .eq("user_id", settingsUserId)
    .maybeSingle();

  const fullPayload = { ...payload, user_id: settingsUserId };

  if (existing) {
    return (supabase as any)
      .from("email_settings")
      .update(fullPayload)
      .eq("user_id", settingsUserId);
  } else {
    return (supabase as any)
      .from("email_settings")
      .insert(fullPayload);
  }
}

export async function encryptSmtpPassword(plainPassword: string) {
  return (supabase as any).rpc("encrypt_smtp_password", { plain_password: plainPassword });
}

/** SMTP and IMAP credentials share the same server-side encryption primitive. */
export const encryptEmailPassword = encryptSmtpPassword;

export async function invokeTestEmail(userId: string) {
  return supabase.functions.invoke("test-email-settings", {
    body: { user_id: userId },
  });
}

export async function invokeTestIncomingEmail() {
  return supabase.functions.invoke("fleet-email-mailbox", { body: { action: "test" } });
}

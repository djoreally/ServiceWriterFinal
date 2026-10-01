/**
 * Email Settings Commands — Write operations for email configuration.
 */
import { apiClient } from "@/lib/api-client";

export async function saveEmailSettings(payload: Record<string, unknown>) {
  const { data } = await apiClient.put<{ data: unknown; error: null }>("/v1/email-settings", payload);
  return { data, error: null };
}

export async function encryptSmtpPassword(plainPassword: string) {
  const { data } = await apiClient.post<{ data: string | null; error: null }>(
    "/v1/email-settings/encrypt-password",
    { plain_password: plainPassword },
  );
  return { data, error: null };
}

/** SMTP and IMAP credentials share the same server-side encryption primitive. */
export const encryptEmailPassword = encryptSmtpPassword;

export interface EmailConnectionTestResult {
  success?: boolean;
  message?: string;
  error?: string;
}

export async function invokeTestEmail(userId: string) {
  const { data } = await apiClient.post<{ data: EmailConnectionTestResult | null; error: null }>(
    "/v1/email-settings/test-outgoing",
    { user_id: userId },
  );
  return { data, error: null };
}

export async function invokeTestIncomingEmail() {
  const { data } = await apiClient.post<{ data: EmailConnectionTestResult | null; error: null }>(
    "/v1/email-settings/test-incoming",
    {},
  );
  return { data, error: null };
}

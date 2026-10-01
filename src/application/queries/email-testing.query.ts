/**
 * Email Testing Query — Read operations for email queue, logs, and settings.
 */
import { apiClient, ApiClientError } from "@/lib/api-client";

import type { Database } from "@/integrations/supabase/types";

type EmailQueueRow = Database["public"]["Tables"]["email_queue"]["Row"];
type EmailLogRow = Database["public"]["Tables"]["email_logs"]["Row"];

interface EmailTestingSettings {
  id: string;
  use_custom_smtp: boolean | null;
  smtp_host: string | null;
  verified: boolean | null;
}

interface EmailTestingData {
  userEmail: string | null;
  profile: { business_name: string; email: string } | null;
  emailSettings: EmailTestingSettings | null;
  emailQueue: EmailQueueRow[];
  emailLogs: EmailLogRow[];
}

interface EmailTestingPayload {
  userEmail: string | null;
  profile: { business_name: string | null; email: string | null } | null;
  emailSettings: EmailTestingSettings | null;
  emailQueue: EmailQueueRow[];
  emailLogs: EmailLogRow[];
}

function isUnauthenticated(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 401;
}

export async function fetchEmailTestingData(): Promise<EmailTestingData | null> {
  try {
    const payload = await apiClient.get<EmailTestingPayload>("/v1/email-testing/data");
    if (!payload) return null;
    return {
      userEmail: payload.userEmail,
      profile: payload.profile
        ? {
            business_name: payload.profile.business_name ?? "",
            email: payload.profile.email ?? "",
          }
        : null,
      emailSettings: payload.emailSettings,
      emailQueue: payload.emailQueue ?? [],
      emailLogs: payload.emailLogs ?? [],
    };
  } catch (error) {
    if (isUnauthenticated(error)) return null;
    throw error;
  }
}

export async function fetchEmailQueue(): Promise<EmailQueueRow[]> {
  try {
    const { data } = await apiClient.get<{ data: EmailQueueRow[] }>("/v1/email-testing/queue");
    return data ?? [];
  } catch (error) {
    if (isUnauthenticated(error)) return [];
    throw error;
  }
}

export async function fetchEmailLogs(): Promise<EmailLogRow[]> {
  try {
    const { data } = await apiClient.get<{ data: EmailLogRow[] }>("/v1/email-testing/logs");
    return data ?? [];
  } catch (error) {
    if (isUnauthenticated(error)) return [];
    throw error;
  }
}

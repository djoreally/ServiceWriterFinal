/**
 * Email Settings Query — Read operations for email configuration.
 */
import { apiClient, ApiClientError } from "@/lib/api-client";

import type { Database } from "@/integrations/supabase/types";

export type EmailSettingsRow = Database["public"]["Tables"]["email_settings"]["Row"];

export async function fetchEmailSettings(): Promise<EmailSettingsRow | null> {
  try {
    const { data } = await apiClient.get<{ data: EmailSettingsRow | null }>("/v1/email-settings");
    return data ?? null;
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) return null;
    throw error;
  }
}

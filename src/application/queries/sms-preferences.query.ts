/**
 * SMS Preferences Query — legacy SMS automation settings per business.
 */
import { apiClient, ApiClientError } from "@/lib/api-client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface SmsPreferences {
  user_id: string;
  confirmation_enabled: boolean;
  reschedule_enabled: boolean;
  cancellation_enabled: boolean;
  reminder_enabled: boolean;
  reminder_hours_before: number;
  template_confirmation: string | null;
  template_reschedule: string | null;
  template_cancellation: string | null;
  template_reminder: string | null;
}

export const DEFAULT_SMS_PREFERENCES: Omit<SmsPreferences, "user_id"> = {
  confirmation_enabled: true,
  reschedule_enabled: true,
  cancellation_enabled: true,
  reminder_enabled: true,
  reminder_hours_before: 24,
  template_confirmation: null,
  template_reschedule: null,
  template_cancellation: null,
  template_reminder: null,
};

export async function fetchSmsPreferences(): Promise<SmsPreferences | null> {
  try {
    const { data } = await apiClient.get<{ data: SmsPreferences | null }>("/v1/sms-preferences");
    if (data) return data;
    const { data: auth } = await getCurrentAuthUser();
    const uid = auth.user?.id;
    if (!uid) return null;
    return { user_id: uid, ...DEFAULT_SMS_PREFERENCES };
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) return null;
    throw error;
  }
}

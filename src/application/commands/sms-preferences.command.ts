/**
 * SMS Preferences Commands — upsert automation settings.
 */
import { apiClient } from "@/lib/api-client";
import type { SmsPreferences } from "@/application/queries/sms-preferences.query";

export async function upsertSmsPreferences(prefs: SmsPreferences): Promise<void> {
  await apiClient.put("/v1/sms-preferences", prefs);
}

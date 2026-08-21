/**
 * SMS Preferences Query — legacy SMS automation settings per business.
 */
import { supabase } from "@/integrations/supabase/client";

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
  const { data: userData } = await getCurrentAuthUser();
  const uid = userData.user?.id;
  if (!uid) return null;
  const { data, error } = await supabase
    .from("sms_preferences")
    .select("*")
    .eq("user_id", uid)
    .maybeSingle();
  if (error) throw error;
  return (data as SmsPreferences | null) ?? { user_id: uid, ...DEFAULT_SMS_PREFERENCES };
}

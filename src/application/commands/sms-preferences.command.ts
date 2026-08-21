/**
 * SMS Preferences Commands — upsert automation settings.
 */
import { supabase } from "@/integrations/supabase/client";
import type { SmsPreferences } from "@/application/queries/sms-preferences.query";

export async function upsertSmsPreferences(prefs: SmsPreferences): Promise<void> {
  const { error } = await supabase
    .from("sms_preferences")
    .upsert(prefs, { onConflict: "user_id" });
  if (error) throw error;
}

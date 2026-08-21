import { supabase } from "@/integrations/supabase/client";
import type { TrackingSettings } from "@/application/queries/tracking-settings.query";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export async function saveTrackingSettings(settings: TrackingSettings): Promise<void> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");
  const payload = {
    user_id: user.id,
    ...settings,
    enabled: settings.enabled,
    custom_head_script: settings.custom_head_script || null,
    custom_body_script: settings.custom_body_script || null,
  };
  const { error } = await supabase.from("tenant_tracking_settings").upsert(payload, { onConflict: "user_id" });
  if (error) throw error;
}

export async function saveTrackingEnabled(enabled: boolean): Promise<void> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("tenant_tracking_settings")
    .upsert({ user_id: user.id, enabled }, { onConflict: "user_id" });

  if (error) throw error;
}

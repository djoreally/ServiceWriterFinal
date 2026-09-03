import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface TrackingSettings {
  ga4_measurement_id: string | null;
  google_ads_id: string | null;
  google_ads_conversion_label: string | null;
  meta_pixel_id: string | null;
  custom_head_script: string | null;
  custom_body_script: string | null;
  enabled: boolean;
}

const COLS = "ga4_measurement_id,google_ads_id,google_ads_conversion_label,meta_pixel_id,custom_head_script,custom_body_script,enabled";
const PUBLIC_COLS = "ga4_measurement_id,google_ads_id,google_ads_conversion_label,meta_pixel_id,enabled";

export async function fetchTrackingSettings(): Promise<TrackingSettings | null> {
  const {
    data: { user },
  } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("tenant_tracking_settings")
    .select(COLS)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return (data as TrackingSettings | null) ?? null;
}

export async function fetchPublicTrackingSettings(userId: string): Promise<TrackingSettings | null> {
  const { data, error } = await supabase
    .from("tenant_tracking_settings")
    .select(PUBLIC_COLS)
    .eq("user_id", userId)
    .eq("enabled", true)
    .maybeSingle();
  if (error) return null;
  if (!data) return null;
  return {
    ...(data as Omit<TrackingSettings, "custom_head_script" | "custom_body_script">),
    custom_head_script: null,
    custom_body_script: null,
  };
}

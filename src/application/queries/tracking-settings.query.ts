import { apiClient } from "@/lib/api-client";

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

export async function fetchTrackingSettings(): Promise<TrackingSettings | null> {
  const {
    data: { user },
  } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");

  const data = await apiClient.get<TrackingSettings | null>(
    "/v1/platform/tracking-settings",
  );
  return data ?? null;
}

export async function fetchPublicTrackingSettings(userId: string): Promise<TrackingSettings | null> {
  const data = await apiClient.get<TrackingSettings | null>(
    "/v1/platform/tracking-settings/public",
    { query: { user_id: userId } },
  );
  return data ?? null;
}

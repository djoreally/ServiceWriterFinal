import { apiClient } from "@/lib/api-client";
import type { TrackingSettings } from "@/application/queries/tracking-settings.query";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export async function saveTrackingSettings(settings: TrackingSettings): Promise<void> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");
  await apiClient.put("/v1/platform/tracking-settings", settings);
}

export async function saveTrackingEnabled(enabled: boolean): Promise<void> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");

  await apiClient.patch("/v1/platform/tracking-settings/enabled", { enabled });
}

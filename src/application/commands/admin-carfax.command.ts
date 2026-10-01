/**
 * Admin CARFAX Commands — Write operations for platform-level CARFAX config.
 */
import { apiClient } from "@/lib/api-client";
import type { CarfaxConfig } from "@/application/queries/admin-carfax.query";

export async function saveAdminCarfaxSettings(config: CarfaxConfig): Promise<void> {
  await apiClient.put("/v1/admin/carfax/settings", { config });
}

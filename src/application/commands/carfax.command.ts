/** CARFAX Command — canonical settings and feed generation. */
import { apiClient } from "@/lib/api-client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import { mapCarfaxSourceRows } from "@/lib/carfax/feed";
import type {
  CarfaxExportServiceRecord,
  CarfaxSourceRow,
} from "@/lib/carfax/feed";

/**
 * The feed construction itself (fields, formatter, row mapping) lives in
 * "@/lib/carfax/feed" — pure code shared with the production generator in
 * src/server/carfax. Re-exported here so existing imports keep working.
 */
export {
  CARFAX_FEED_FIELDS,
  CARFAX_MANAGEMENT_SYSTEM,
  carfaxFeedFileName,
  carfaxFeedHeaderRow,
  formatCarfaxFeed,
  mapCarfaxSourceRows,
  parseCarfaxFeedLine,
} from "@/lib/carfax/feed";
export type {
  CarfaxExportLaborItem,
  CarfaxExportServiceItem,
  CarfaxExportServiceRecord,
  CarfaxExportVehicle,
  CarfaxFeedBusiness,
  CarfaxFeedField,
  CarfaxSourceLine,
  CarfaxSourceRow,
  CarfaxSourceVehicle,
} from "@/lib/carfax/feed";

export async function saveCarfaxSettings(settings: {
  carfax_location_id: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  website_url: string | null;
  carfax_product_data_id?: string | null;
  carfax_comp_code?: string | null;
}): Promise<void> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Select a workspace before saving CARFAX settings.");
  await apiClient.put("/v1/carfax/settings", {
    ...settings,
    selected_workspace_id: context.workspaceId,
  });
}

interface ActivateCarfaxShopData {
  businessName: string; address: string; city: string; state: string; zip: string;
  phone: string; url?: string; contactName: string;
}
interface ActivateCarfaxShopResponse { success: boolean; locationId?: string; error?: string; }

/** CARFAX remote activation requires a provider integration that Final does not yet have. */
export async function activateCarfaxShop(_data: ActivateCarfaxShopData): Promise<ActivateCarfaxShopResponse> {
  throw new Error("CARFAX activation provider is not configured on Final yet.");
}

/** Feed download remains functional; Final does not yet persist a separate export-log table. */
export async function recordCarfaxExport(_exportType: string, _fileName: string, _recordCount: number): Promise<void> {
  return;
}

export async function fetchCarfaxExportServices(exportType: "PROD" | "HIST"): Promise<CarfaxExportServiceRecord[]> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Select a workspace before exporting CARFAX service history.");
  const { data } = await apiClient.get<{ data: CarfaxSourceRow[] }>("/v1/carfax/export-services", {
    query: { selected_workspace_id: context.workspaceId },
  });

  const today = new Date().toISOString().slice(0, 10);
  return mapCarfaxSourceRows((data ?? []) as unknown as CarfaxSourceRow[], exportType, today);
}

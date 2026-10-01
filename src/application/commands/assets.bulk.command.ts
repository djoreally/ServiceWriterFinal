/**
 * Bulk asset commands — multi-select delete, move-to-folder, and
 * attach/detach to CRM service records.
 * RLS guarantees ownership; we use ON CONFLICT DO NOTHING for idempotent attaches.
 */
import { apiClient, apiRequest } from "@/lib/api-client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";

export interface BulkResult {
  succeeded: string[];
  failed: { id: string; reason: string }[];
}

export async function bulkDeleteAssets(ids: string[]): Promise<BulkResult> {
  const result: BulkResult = { succeeded: [], failed: [] };
  if (ids.length === 0) return result;

  try {
    const response = await apiClient.post<{ data: BulkResult }>("/v1/assets/bulk-delete", { ids });
    return response.data;
  } catch (error) {
    return { succeeded: [], failed: ids.map((id) => ({ id, reason: error instanceof Error ? error.message : "Request failed" })) };
  }
}

export async function bulkMoveAssets(
  ids: string[],
  folder: string | null,
): Promise<BulkResult> {
  if (ids.length === 0) return { succeeded: [], failed: [] };
  const normalized = folder?.trim() ? folder.trim() : null;
  try {
    const response = await apiClient.patch<{ data: BulkResult }>("/v1/assets/bulk-move", {
      ids,
      folder: normalized,
    });
    return response.data;
  } catch (error) {
    return { succeeded: [], failed: ids.map((id) => ({ id, reason: error instanceof Error ? error.message : "Request failed" })) };
  }
}

export async function attachAssetsToService(
  serviceId: string,
  assetIds: string[],
): Promise<BulkResult> {
  if (assetIds.length === 0) return { succeeded: [], failed: [] };
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("You must be signed in.");

  try {
    const response = await apiClient.post<{ data: BulkResult }>("/v1/assets/attach", {
      service_id: serviceId,
      asset_ids: assetIds,
    });
    return response.data;
  } catch (error) {
    return { succeeded: [], failed: assetIds.map((id) => ({ id, reason: error instanceof Error ? error.message : "Request failed" })) };
  }
}

export async function detachAssetFromService(
  serviceId: string,
  assetId: string,
): Promise<void> {
  // apiClient.delete has no body overload; apiRequest from the same
  // sanctioned client module supports a DELETE body.
  await apiRequest("/v1/assets/attach", {
    method: "DELETE",
    body: JSON.stringify({ service_id: serviceId, asset_id: assetId }),
  });
}

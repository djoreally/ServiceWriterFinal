/**
 * Assets Queries — read-only access to the user's asset library.
 */

import { apiClient } from "@/lib/api-client";
import type { AssetRecord } from "@/application/commands/assets.command";
import type { AssetType } from "@/lib/assets/validation";

export interface ListAssetsParams {
  search?: string;
  assetType?: AssetType | "all";
  sort?: "newest" | "oldest" | "name" | "size";
  limit?: number;
  offset?: number;
  /** Filter by folder name. `null` = "Uncategorized" (folder IS NULL). `undefined` = no filter. */
  folder?: string | null;
}

export interface ListAssetsResult {
  items: AssetRecord[];
  total: number;
}

export async function listAssets(
  params: ListAssetsParams = {},
): Promise<ListAssetsResult> {
  const {
    search,
    assetType = "all",
    sort = "newest",
    limit = 50,
    offset = 0,
    folder,
  } = params;

  const response = await apiClient.get<{ data: ListAssetsResult }>("/v1/assets", {
    query: {
      ...(search?.trim() ? { search: search.trim() } : {}),
      ...(assetType !== "all" ? { asset_type: assetType } : {}),
      sort,
      limit,
      offset,
      ...(folder === null ? { folder_null: "true" } : {}),
      ...(typeof folder === "string" ? { folder } : {}),
    },
  });
  return { items: response.data.items ?? [], total: response.data.total ?? 0 };
}

export async function getAssetSignedUrl(
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const response = await apiClient.get<{ data: { signed_url: string | null } }>("/v1/assets/signed-url", {
    query: { storage_path: storagePath, expires_in: expiresInSeconds },
  });
  const signedUrl = response.data.signed_url;
  if (!signedUrl) {
    throw new Error("Failed to create signed URL");
  }
  return signedUrl;
}

export async function getAssetById(id: string): Promise<AssetRecord | null> {
  const response = await apiClient.get<{ data: AssetRecord | null }>(`/v1/assets/${id}`);
  return response.data ?? null;
}

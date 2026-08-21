/**
 * Assets Queries — read-only access to the user's asset library.
 */

import { supabase } from "@/integrations/supabase/client";
import type { AssetRecord } from "@/application/commands/assets.command";
import type { AssetType } from "@/lib/assets/validation";

const BUCKET = "assets";

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

  let q = supabase
    .from("assets")
    .select("*", { count: "exact" })
    .is("deleted_at", null);

  if (folder === null) q = q.is("folder", null);
  else if (typeof folder === "string") q = q.eq("folder", folder);

  if (assetType !== "all") q = q.eq("asset_type", assetType);
  if (search && search.trim()) {
    q = q.ilike("original_filename", `%${search.trim()}%`);
  }

  switch (sort) {
    case "oldest":
      q = q.order("created_at", { ascending: true });
      break;
    case "name":
      q = q.order("original_filename", { ascending: true });
      break;
    case "size":
      q = q.order("file_size", { ascending: false });
      break;
    case "newest":
    default:
      q = q.order("created_at", { ascending: false });
  }

  q = q.range(offset, offset + limit - 1);

  const { data, error, count } = await q;
  if (error) throw error;
  return { items: (data ?? []) as AssetRecord[], total: count ?? 0 };
}

export async function getAssetSignedUrl(
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || "Failed to create signed URL");
  }
  return data.signedUrl;
}

export async function getAssetById(id: string): Promise<AssetRecord | null> {
  const { data, error } = await supabase
    .from("assets")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return (data as AssetRecord) ?? null;
}

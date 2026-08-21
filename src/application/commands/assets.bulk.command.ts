/**
 * Bulk asset commands — multi-select delete, move-to-folder, and
 * attach/detach to CRM service records.
 * RLS guarantees ownership; we use ON CONFLICT DO NOTHING for idempotent attaches.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
const BUCKET = "assets";

export interface BulkResult {
  succeeded: string[];
  failed: { id: string; reason: string }[];
}

export async function bulkDeleteAssets(ids: string[]): Promise<BulkResult> {
  const result: BulkResult = { succeeded: [], failed: [] };
  if (ids.length === 0) return result;

  const { data: rows, error: fetchErr } = await supabase
    .from("assets")
    .select("id, storage_path")
    .in("id", ids);
  if (fetchErr) throw fetchErr;

  const paths = (rows ?? []).map((r) => r.storage_path).filter(Boolean);
  if (paths.length) {
    await supabase.storage.from(BUCKET).remove(paths).catch(() => {});
  }

  const { error: updErr } = await supabase
    .from("assets")
    .update({ status: "deleted", deleted_at: new Date().toISOString() })
    .in("id", ids);
  if (updErr) {
    return { succeeded: [], failed: ids.map((id) => ({ id, reason: updErr.message })) };
  }
  result.succeeded = ids;
  return result;
}

export async function bulkMoveAssets(
  ids: string[],
  folder: string | null,
): Promise<BulkResult> {
  if (ids.length === 0) return { succeeded: [], failed: [] };
  const normalized = folder?.trim() ? folder.trim() : null;
  const { error } = await supabase
    .from("assets")
    .update({ folder: normalized })
    .in("id", ids);
  if (error) {
    return { succeeded: [], failed: ids.map((id) => ({ id, reason: error.message })) };
  }
  return { succeeded: ids, failed: [] };
}

export async function attachAssetsToService(
  serviceId: string,
  assetIds: string[],
): Promise<BulkResult> {
  if (assetIds.length === 0) return { succeeded: [], failed: [] };
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("You must be signed in.");

  const rows = assetIds.map((asset_id) => ({
    service_id: serviceId,
    asset_id,
    user_id: user.id,
  }));

  // Upsert ignores existing pairs (idempotent attach)
  const { error } = await supabase
    .from("service_assets")
    .upsert(rows, { onConflict: "service_id,asset_id", ignoreDuplicates: true });

  if (error) {
    return { succeeded: [], failed: assetIds.map((id) => ({ id, reason: error.message })) };
  }
  return { succeeded: assetIds, failed: [] };
}

export async function detachAssetFromService(
  serviceId: string,
  assetId: string,
): Promise<void> {
  const { error } = await supabase
    .from("service_assets")
    .delete()
    .eq("service_id", serviceId)
    .eq("asset_id", assetId);
  if (error) throw error;
}

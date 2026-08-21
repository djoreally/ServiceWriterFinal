/**
 * Assets Commands — upload, rename, delete.
 * Uploads go directly from the browser to private storage; metadata is
 * persisted in the `assets` table (RLS enforces ownership).
 */

import { supabase } from "@/integrations/supabase/client";
import {
  validateFile,
  getExtension,
  sanitizeFilename,
  type AssetType,
} from "@/lib/assets/validation";
import { extractMediaMetadata } from "@/lib/assets/metadata";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
const BUCKET = "assets";

export interface AssetRecord {
  id: string;
  user_id: string;
  storage_path: string;
  bucket: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  asset_type: AssetType;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  thumbnail_path: string | null;
  status: "uploading" | "processing" | "ready" | "failed" | "deleted";
  folder: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function friendlyStorageError(message: string | undefined): string {
  const m = (message || "").toLowerCase();
  if (m.includes("bucket") && m.includes("not found")) {
    return "Asset storage isn't ready yet. Please try again in a moment.";
  }
  if (m.includes("payload") && m.includes("too large")) {
    return "File is larger than your storage limit.";
  }
  if (m.includes("permission") || m.includes("not authorized") || m.includes("rls")) {
    return "You don't have permission to upload this file.";
  }
  if (m.includes("network") || m.includes("failed to fetch")) {
    return "Network error during upload. Please retry.";
  }
  return message || "Upload failed";
}

export async function uploadAsset(
  file: File,
  opts?: { onProgress?: (pct: number) => void; signal?: AbortSignal; userId?: string },
): Promise<AssetRecord> {
  let userId = opts?.userId;
  if (!userId) {
    const { data: { user } } = await getCurrentAuthUser();
    if (!user) throw new Error("You must be signed in to upload assets.");
    userId = user.id;
  }

  const v = validateFile(file);
  if (!v.ok) throw new Error(v.reason || "Invalid file");

  // Extract metadata before upload (cheap, browser-native)
  const meta = await extractMediaMetadata(file, v.assetType);

  const ext = getExtension(file.name) || "bin";
  const assetId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const safeName = sanitizeFilename(file.name);
  const storagePath = `${userId}/${assetId}.${ext}`;

  // Direct browser → private bucket upload. supabase-js v2 streams the blob.
  opts?.onProgress?.(5);
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      cacheControl: "3600",
      upsert: false,
    });
  if (uploadErr) {
    throw new Error(friendlyStorageError(uploadErr.message));
  }
  opts?.onProgress?.(90);

  const { data: row, error: insertErr } = await supabase
    .from("assets")
    .insert({
      user_id: userId,
      storage_path: storagePath,
      bucket: BUCKET,
      original_filename: safeName,
      mime_type: file.type || "application/octet-stream",
      file_size: file.size,
      asset_type: v.assetType,
      width: meta.width ?? null,
      height: meta.height ?? null,
      duration_seconds: meta.durationSeconds ?? null,
      status: "ready",
    })
    .select("*")
    .single();

  if (insertErr || !row) {
    // Rollback storage if DB insert fails
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    throw new Error(insertErr?.message || "Failed to save asset record");
  }
  opts?.onProgress?.(100);
  return row as AssetRecord;
}

export async function renameAsset(id: string, newName: string): Promise<void> {
  const trimmed = sanitizeFilename(newName.trim());
  if (!trimmed) throw new Error("Name cannot be empty");
  const { error } = await supabase
    .from("assets")
    .update({ original_filename: trimmed })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteAsset(id: string): Promise<void> {
  // Fetch path first
  const { data: row, error: fetchErr } = await supabase
    .from("assets")
    .select("storage_path")
    .eq("id", id)
    .single();
  if (fetchErr || !row) throw new Error(fetchErr?.message || "Asset not found");

  await supabase.storage.from(BUCKET).remove([row.storage_path]).catch(() => {});

  // Soft delete (preserves history); RLS guarantees ownership
  const { error: updErr } = await supabase
    .from("assets")
    .update({ status: "deleted", deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (updErr) throw updErr;
}

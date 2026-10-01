/**
 * Assets Commands — upload, rename, delete.
 * Uploads go from the browser to private storage via the Hono API; metadata is
 * persisted in the `assets` table (server enforces ownership).
 */

import { apiClient } from "@/lib/api-client";
import {
  validateFile,
  getExtension,
  sanitizeFilename,
  type AssetType,
} from "@/lib/assets/validation";
import { extractMediaMetadata } from "@/lib/assets/metadata";

import { getCurrentAuthUser } from "@/lib/auth/current-user";

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

  opts?.onProgress?.(5);

  const form = new FormData();
  form.append("file", file);
  form.append("storage_path", storagePath);
  form.append("original_filename", safeName);
  form.append("mime_type", file.type || "application/octet-stream");
  form.append("file_size", String(file.size));
  form.append("asset_type", v.assetType);
  if (meta.width != null) form.append("width", String(meta.width));
  if (meta.height != null) form.append("height", String(meta.height));
  if (meta.durationSeconds != null) form.append("duration_seconds", String(meta.durationSeconds));

  try {
    const response = await apiClient.post<{ data: AssetRecord }>("/v1/assets/upload", form, {
      signal: opts?.signal,
    });
    if (!response.data) throw new Error("Failed to save asset record");
    opts?.onProgress?.(100);
    return response.data;
  } catch (error) {
    throw new Error(friendlyStorageError(error instanceof Error ? error.message : undefined));
  }
}

export async function renameAsset(id: string, newName: string): Promise<void> {
  const trimmed = sanitizeFilename(newName.trim());
  if (!trimmed) throw new Error("Name cannot be empty");
  await apiClient.patch(`/v1/assets/${id}`, { original_filename: trimmed });
}

export async function deleteAsset(id: string): Promise<void> {
  // Server fetches the storage path, removes the object, then soft-deletes.
  await apiClient.delete(`/v1/assets/${id}`);
}

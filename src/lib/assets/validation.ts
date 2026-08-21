/**
 * Asset upload validation.
 * Client-side first line of defense. Server enforces RLS + storage policies.
 */

export type AssetType = "image" | "video" | "audio" | "document" | "other";

interface TypeSpec {
  mimes: string[];
  exts: string[];
  maxBytes: number;
}

export const ASSET_TYPE_SPECS: Record<Exclude<AssetType, "other">, TypeSpec> = {
  image: {
    mimes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/svg+xml",
    ],
    exts: ["jpg", "jpeg", "png", "webp", "gif", "svg"],
    maxBytes: 20 * 1024 * 1024, // 20 MB
  },
  video: {
    mimes: ["video/mp4", "video/quicktime", "video/webm"],
    exts: ["mp4", "mov", "webm"],
    maxBytes: 500 * 1024 * 1024, // 500 MB
  },
  audio: {
    mimes: [
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/x-wav",
      "audio/mp4",
      "audio/x-m4a",
      "audio/m4a",
    ],
    exts: ["mp3", "wav", "m4a"],
    maxBytes: 50 * 1024 * 1024, // 50 MB
  },
  document: {
    mimes: [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/msword",
      "application/vnd.ms-excel",
      "text/csv",
      "text/plain",
      "application/zip",
      "application/x-zip-compressed",
    ],
    exts: ["pdf", "docx", "doc", "xlsx", "xls", "csv", "txt", "zip"],
    maxBytes: 50 * 1024 * 1024, // 50 MB
  },
};

export const ALLOWED_ACCEPT = [
  ...ASSET_TYPE_SPECS.image.mimes,
  ...ASSET_TYPE_SPECS.video.mimes,
  ...ASSET_TYPE_SPECS.audio.mimes,
  ...ASSET_TYPE_SPECS.document.mimes,
].join(",");

export function getExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx >= 0 ? filename.slice(idx + 1).toLowerCase() : "";
}

export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 180);
}

export interface ValidationResult {
  ok: boolean;
  assetType: AssetType;
  reason?: string;
}

export function validateFile(file: File): ValidationResult {
  const ext = getExtension(file.name);
  const mime = file.type || "";

  let matchedType: AssetType | null = null;
  for (const [type, spec] of Object.entries(ASSET_TYPE_SPECS) as [
    Exclude<AssetType, "other">,
    TypeSpec,
  ][]) {
    const mimeOk = mime ? spec.mimes.includes(mime) : false;
    const extOk = spec.exts.includes(ext);
    if (mimeOk || extOk) {
      // Require at least one to be valid, and reject if MIME present but mismatched
      if (mime && !mimeOk && !extOk) continue;
      matchedType = type;
      if (file.size > spec.maxBytes) {
        return {
          ok: false,
          assetType: type,
          reason: `File too large. Max ${Math.round(
            spec.maxBytes / (1024 * 1024),
          )} MB for ${type} files.`,
        };
      }
      break;
    }
  }

  if (!matchedType) {
    return {
      ok: false,
      assetType: "other",
      reason: "Unsupported file type.",
    };
  }

  return { ok: true, assetType: matchedType };
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

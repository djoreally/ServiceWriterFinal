/**
 * Extract media metadata client-side before upload.
 * Best-effort: failures fall back to nulls so upload still proceeds.
 */

import type { AssetType } from "./validation";

export interface MediaMetadata {
  width?: number;
  height?: number;
  durationSeconds?: number;
}

export async function extractMediaMetadata(
  file: File,
  assetType: AssetType,
): Promise<MediaMetadata> {
  try {
    if (assetType === "image") return await extractImageMeta(file);
    if (assetType === "video") return await extractVideoMeta(file);
    if (assetType === "audio") return await extractAudioMeta(file);
  } catch {
    /* swallow */
  }
  return {};
}

function extractImageMeta(file: File): Promise<MediaMetadata> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const out = { width: img.naturalWidth, height: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(out);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({});
    };
    img.src = url;
  });
}

function extractVideoMeta(file: File): Promise<MediaMetadata> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const out = {
        width: video.videoWidth,
        height: video.videoHeight,
        durationSeconds: Number.isFinite(video.duration)
          ? Math.round(video.duration)
          : undefined,
      };
      URL.revokeObjectURL(url);
      resolve(out);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({});
    };
    video.src = url;
  });
}

function extractAudioMeta(file: File): Promise<MediaMetadata> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const out = {
        durationSeconds: Number.isFinite(audio.duration)
          ? Math.round(audio.duration)
          : undefined,
      };
      URL.revokeObjectURL(url);
      resolve(out);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({});
    };
    audio.src = url;
  });
}

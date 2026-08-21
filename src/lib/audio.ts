/**
 * Audio recording utilities for voice inspections.
 * Uses the browser MediaRecorder API.
 */

/** Preferred MIME types in order of browser support */
const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
];

/** Get the best supported audio MIME type for this browser */
export function getSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm';
  for (const mime of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return 'audio/webm'; // fallback
}

/** Get file extension for a given MIME type */
export function getExtensionForMime(mime: string): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

/** Format seconds as MM:SS */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/** Check if the browser supports audio recording */
export function isRecordingSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices !== 'undefined' &&
    typeof navigator.mediaDevices.getUserMedia === 'function' &&
    typeof MediaRecorder !== 'undefined'
  );
}

/** Maximum recording duration in seconds (10 minutes) */
export const MAX_RECORDING_SECONDS = 600;

/** Maximum audio file size in bytes (25 MB — Whisper API limit) */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/**
 * Convert an audio Blob to a File with the appropriate extension.
 */
export function audioToFile(blob: Blob, mimeType: string, name?: string): File {
  const ext = getExtensionForMime(mimeType);
  const fileName = name || `recording-${Date.now()}.${ext}`;
  return new File([blob], fileName, { type: mimeType });
}

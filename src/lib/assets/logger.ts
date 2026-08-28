/**
 * Lightweight, PII-free logger for the Assets module.
 * Wraps console.warn with an [assets] prefix and a short request ID so failures
 * are traceable without leaking filenames or other user content.
 */

type AssetEvent =
  | "list_failed"
  | "sign_url_failed"
  | "upload_failed"
  | "delete_failed"
  | "rename_failed"
  | "realtime_error"
  | "infra_probe_failed";

export function newRequestId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function logAssetEvent(
  event: AssetEvent,
  meta: Record<string, string | number | boolean | null | undefined> = {},
): string {
  const requestId = newRequestId();
  try {
     
    console.warn(`[assets:${event}] rid=${requestId}`, meta);
  } catch {
    /* noop */
  }
  return requestId;
}

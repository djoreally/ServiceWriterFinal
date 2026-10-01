/**
 * Isolated, fail-soft change watcher for the assets table.
 *
 * Realtime (postgres_changes) is not available through the API client, so this
 * hook polls the canonical assets list and fires `onChange` only when the
 * fingerprint (id + updated_at + status per row) changes.
 * - Polls only when userId is known.
 * - Channel errors are non-fatal (logged, then the hook keeps polling).
 */

import { useEffect } from "react";
import { apiClient } from "@/lib/api-client";
import { logAssetEvent } from "@/lib/assets/logger";

const POLL_INTERVAL_MS = 15_000;

interface AssetFingerprintRow {
  id: string;
  updated_at?: string | null;
  status?: string | null;
}

function fingerprint(rows: AssetFingerprintRow[]): string {
  return rows
    .map((row) => `${row.id}:${row.updated_at ?? ""}:${row.status ?? ""}`)
    .sort()
    .join("|");
}

export function useAssetsRealtime(
  userId: string | null | undefined,
  onChange: () => void,
) {
  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    let lastFingerprint: string | null = null;

    const check = async () => {
      if (cancelled) return;
      try {
        const response = await apiClient.get<{ data: { items: AssetFingerprintRow[] } }>(
          "/v1/assets",
          { query: { limit: 100, offset: 0 } },
        );
        if (cancelled) return;
        const next = fingerprint(response.data?.items ?? []);
        if (lastFingerprint !== null && next !== lastFingerprint) {
          try {
            onChange();
          } catch {
            /* swallow consumer errors */
          }
        }
        lastFingerprint = next;
      } catch (error) {
        logAssetEvent("realtime_error", {
          reason: (error as Error)?.message || "poll_failed",
        });
      }
    };

    void check();
    const timer = setInterval(() => {
      void check();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [userId, onChange]);
}

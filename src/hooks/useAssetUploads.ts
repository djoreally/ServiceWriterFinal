/**
 * Upload queue manager — tracks per-file progress, errors, and retries.
 * Caps concurrency to 3 to avoid hammering storage from a single tab.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { uploadAsset, type AssetRecord } from "@/application/commands/assets.command";
import { supabase } from "@/integrations/supabase/client";
import { logAssetEvent } from "@/lib/assets/logger";

export type UploadStatus = "queued" | "uploading" | "success" | "error";

export interface UploadItem {
  id: string;
  file: File;
  progress: number;
  status: UploadStatus;
  error?: string;
}

const MAX_CONCURRENT = 3;

export function useAssetUploads(onComplete?: (asset: AssetRecord) => void) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const activeRef = useRef(0);
  const queueRef = useRef<UploadItem[]>([]);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth
      .getUser()
      .then(({ data: { user } }) => {
        if (!cancelled) userIdRef.current = user?.id ?? null;
      })
      .catch(() => {
        /* fall back to per-upload resolution */
      });
    return () => {
      cancelled = true;
    };
  }, []);


  const update = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }, []);

  const pump = useCallback(async function pumpQueue() {
    while (activeRef.current < MAX_CONCURRENT && queueRef.current.length > 0) {
      const next = queueRef.current.shift()!;
      activeRef.current += 1;
      update(next.id, { status: "uploading", progress: 0 });
      uploadAsset(next.file, {
        onProgress: (pct) => update(next.id, { progress: pct }),
        userId: userIdRef.current ?? undefined,
      })
        .then((asset) => {
          update(next.id, { status: "success", progress: 100 });
          onComplete?.(asset);
        })
        .catch((err: Error) => {
          logAssetEvent("upload_failed", {
            reason: err?.message || "unknown",
            size: next.file.size,
            mime: next.file.type || null,
          });
          update(next.id, { status: "error", error: err.message });
        })
        .finally(() => {
          activeRef.current -= 1;
          void pumpQueue();
        });
    }
  }, [onComplete, update]);

  const enqueue = useCallback(
    (files: File[]) => {
      const newItems: UploadItem[] = files.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        progress: 0,
        status: "queued",
      }));
      setItems((prev) => [...prev, ...newItems]);
      queueRef.current.push(...newItems);
      void pump();
    },
    [pump],
  );

  const retry = useCallback(
    (id: string) => {
      const item = items.find((i) => i.id === id);
      if (!item || item.status !== "error") return;
      update(id, { status: "queued", progress: 0, error: undefined });
      queueRef.current.push({ ...item, status: "queued", progress: 0 });
      void pump();
    },
    [items, pump, update],
  );

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setItems((prev) => prev.filter((i) => i.status !== "success"));
  }, []);

  return { items, enqueue, retry, dismiss, clearCompleted };
}

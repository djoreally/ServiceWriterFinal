import { useCallback, useEffect, useMemo, useState } from "react";

// Offline queue dormancy contract:
// when `enabled` is false this hook must stay side-effect free for offline state
// (no reads, no writes, no listeners, no processing).

export interface OfflineSyncItem<TPayload extends Record<string, unknown>> {
  id: string;
  queueType: string;
  entityKey: string;
  payload: TPayload;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  nextRetryAt?: string;
  lastError?: string;
}

interface UseOfflineSyncQueueOptions<TPayload extends Record<string, unknown>> {
  storageKey: string;
  queueType: string;
  staleAfterMs?: number;
  maxAttempts?: number;
  processItem: (item: OfflineSyncItem<TPayload>) => Promise<void>;
  /** When false: no localStorage reads/writes, no listeners, no enqueue/process work. */
  enabled?: boolean;
}

const DEFAULT_STALE_AFTER_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const DEFAULT_MAX_ATTEMPTS = 5;

export function useOfflineSyncQueue<TPayload extends Record<string, unknown>>(
  options: UseOfflineSyncQueueOptions<TPayload>,
) {
  const {
    storageKey,
    queueType,
    processItem,
    staleAfterMs = DEFAULT_STALE_AFTER_MS,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    enabled = true,
  } = options;

  const [queue, setQueue] = useState<Array<OfflineSyncItem<TPayload>>>([]);
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== "undefined" ? navigator.onLine : false);
  const [isProcessing, setIsProcessing] = useState(false);

  const isStale = useCallback((item: OfflineSyncItem<TPayload>) => {
    return Date.now() - new Date(item.updatedAt).getTime() > staleAfterMs;
  }, [staleAfterMs]);

  useEffect(() => {
    // Disabled must mean no storage reads.
    if (!enabled || typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return;
      const parsed = JSON.parse(stored) as Array<OfflineSyncItem<TPayload>>;
      setQueue(parsed.filter((item) => !isStale(item)));
    } catch {
      try { localStorage.removeItem(storageKey); } catch {}
    }
  }, [enabled, storageKey, isStale]);

  useEffect(() => {
    // Disabled must mean no storage writes.
    if (!enabled || typeof window === "undefined") return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(queue));
    } catch {
      // ignore storage failures
    }
  }, [enabled, storageKey, queue]);

  useEffect(() => {
    if (!enabled) {
      setQueue((prev) => (prev.length === 0 ? prev : []));
    }
  }, [enabled]);

  useEffect(() => {
    // Disabled must mean no network listeners.
    if (!enabled || typeof window === "undefined") return;

    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [enabled]);

  const enqueue = useCallback((params: { entityKey: string; payload: TPayload; }) => {
    // Disabled must mean no queue mutation.
    if (!enabled) {
      return;
    }

    const now = new Date().toISOString();

    setQueue((prev) => {
      // Conflict resolution: last write wins for same entity key
      const existing = prev.find((item) => item.entityKey === params.entityKey);
      if (existing) {
        return prev.map((item) => item.entityKey === params.entityKey
          ? { ...item, payload: params.payload, updatedAt: now, nextRetryAt: undefined, lastError: undefined }
          : item);
      }

      const next: OfflineSyncItem<TPayload> = {
        id: crypto.randomUUID(),
        queueType,
        entityKey: params.entityKey,
        payload: params.payload,
        createdAt: now,
        updatedAt: now,
        attempts: 0,
      };
      return [...prev, next];
    });
  }, [enabled, queueType]);

  const removeItem = useCallback((id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const processQueue = useCallback(async () => {
    // Disabled must mean no background processing.
    if (!enabled || !isOnline || isProcessing || queue.length === 0) return;

    setIsProcessing(true);

    for (const item of queue) {
      if (isStale(item)) {
        removeItem(item.id);
        continue;
      }

      if (item.nextRetryAt && new Date(item.nextRetryAt).getTime() > Date.now()) {
        continue;
      }

      try {
        await processItem(item);
        removeItem(item.id);
      } catch (error) {
        const nextAttempts = item.attempts + 1;
        if (nextAttempts >= maxAttempts) {
          removeItem(item.id);
          continue;
        }

        const delayMs = Math.min(60_000, 2 ** nextAttempts * 1000);
        const nextRetryAt = new Date(Date.now() + delayMs).toISOString();

        setQueue((prev) => prev.map((existing) => existing.id === item.id
          ? {
              ...existing,
              attempts: nextAttempts,
              updatedAt: new Date().toISOString(),
              nextRetryAt,
              lastError: error instanceof Error ? error.message : "Sync failed",
            }
          : existing));
      }
    }

    setIsProcessing(false);
  }, [enabled, isOnline, isProcessing, queue, isStale, processItem, removeItem, maxAttempts]);

  useEffect(() => {
    if (enabled && isOnline && queue.length > 0 && !isProcessing) {
      void processQueue();
    }
  }, [enabled, isOnline, queue.length, isProcessing, processQueue]);

  return useMemo(() => ({
    queue,
    isOnline,
    isProcessing,
    queueCount: queue.length,
    enqueue,
    processQueue,
    removeItem,
  }), [queue, isOnline, isProcessing, enqueue, processQueue, removeItem]);
}

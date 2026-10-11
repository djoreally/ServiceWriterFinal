import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Cloud, CloudOff, Loader2, AlertCircle, Check } from "lucide-react";

/**
 * Autosave is a system.
 *
 * - Nothing saves on every keystroke. Timer starts on pause, resets on type.
 *   800ms of silence → one clean write.
 * - The pill is a state machine: typing / saving / saved / offline / error.
 *   Users trust the pill more than the feature. Never let it lie.
 * - Offline: every edit joins a local queue. Badge counts what's waiting.
 *   Reconnect → queue drains in order, oldest first.
 * - Two tabs, one document: last-write-wins means someone's hour disappears.
 *   Merge the changes or warn. Never overwrite in silence.
 * - Closing with work unsaved: the browser blocks the tab and asks.
 *   One ugly dialog beats an afternoon retyped.
 */

export type SaveState = "idle" | "typing" | "saving" | "saved" | "offline" | "error" | "conflict";

interface QueuedEdit {
  id: string;
  timestamp: number;
  payload: Record<string, unknown>;
}

interface UseAutosaveProps<T> {
  /** Current form value. */
  value: T;
  /** Persist to server. Must throw on failure. */
  save: (value: T) => Promise<void>;
  /** Serialize for the offline queue and conflict check. */
  serialize?: (value: T) => Record<string, unknown>;
  /** Debounce ms. Default 800. */
  debounceMs?: number;
  /** Storage key for offline queue + tab coordination. */
  storageKey: string;
}

const DEBOUNCE_DEFAULT = 800;

export function useAutosave<T>({
  value,
  save,
  serialize = (v) => v as unknown as Record<string, unknown>,
  debounceMs = DEBOUNCE_DEFAULT,
  storageKey,
}: UseAutosaveProps<T>) {
  const [state, setState] = useState<SaveState>("idle");
  const [queueCount, setQueueCount] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueRef = useRef(value);
  const queueKey = `${storageKey}:queue`;
  const lockKey = `${storageKey}:lock`;

  valueRef.current = value;

  const readQueue = useCallback((): QueuedEdit[] => {
    try {
      return JSON.parse(localStorage.getItem(queueKey) ?? "[]");
    } catch {
      return [];
    }
  }, [queueKey]);

  const writeQueue = useCallback(
    (q: QueuedEdit[]) => {
      localStorage.setItem(queueKey, JSON.stringify(q));
      setQueueCount(q.length);
    },
    [queueKey]
  );

  const drainQueue = useCallback(async () => {
    const q = readQueue();
    if (q.length === 0) return;
    setState("saving");
    // Oldest first.
    for (const edit of q) {
      try {
        await save(edit.payload as T);
      } catch {
        setState("error");
        return;
      }
    }
    writeQueue([]);
    setState("saved");
    setLastSavedAt(new Date());
  }, [readQueue, writeQueue, save]);

  // Reconnect: drain the queue.
  useEffect(() => {
    const onOnline = () => void drainQueue();
    window.addEventListener("online", onOnline);
    setQueueCount(readQueue().length);
    return () => window.removeEventListener("online", onOnline);
  }, [drainQueue, readQueue]);

  // Two tabs, one document: warn on conflict, never overwrite in silence.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === lockKey && e.newValue) {
        const other = JSON.parse(e.newValue);
        // Another tab saved newer data — flag conflict, don't overwrite.
        setState("conflict");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [lockKey]);

  // Unsaved on close: block the tab.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (state === "typing" || state === "saving" || queueCount > 0) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [state, queueCount]);

  /** Call on every keystroke. Debounces the actual save. */
  const touch = useCallback(() => {
    if (!navigator.onLine) {
      setState("offline");
      // Queue the current value.
      const q = readQueue();
      q.push({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        payload: serialize(valueRef.current),
      });
      writeQueue(q);
      return;
    }

    setState("typing");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setState("saving");
      try {
        await save(valueRef.current);
        // Claim the lock so other tabs know.
        localStorage.setItem(lockKey, JSON.stringify({ at: Date.now() }));
        // Clear our own lock event noise after a beat.
        setTimeout(() => {
          if (localStorage.getItem(lockKey)) {
            const parsed = JSON.parse(localStorage.getItem(lockKey)!);
            if (Date.now() - parsed.at > 2000) localStorage.removeItem(lockKey);
          }
        }, 2500);
        setState("saved");
        setLastSavedAt(new Date());
      } catch {
        setState("error");
      }
    }, debounceMs);
  }, [save, serialize, debounceMs, readQueue, writeQueue, lockKey]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { state, queueCount, lastSavedAt, touch, drainQueue };
}

interface SavePillProps {
  state: SaveState;
  queueCount: number;
  lastSavedAt: Date | null;
  onRetry?: () => void;
  className?: string;
}

/** The pill users trust more than the feature. Never let it lie. */
export function SavePill({ state, queueCount, lastSavedAt, onRetry, className }: SavePillProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
        state === "saved" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
        state === "typing" && "border-muted bg-muted/50 text-muted-foreground",
        state === "saving" && "border-primary/30 bg-primary/10 text-primary",
        state === "offline" && "border-amber-500/30 bg-amber-500/10 text-amber-600",
        state === "error" && "border-destructive/30 bg-destructive/10 text-destructive",
        state === "conflict" && "border-destructive/30 bg-destructive/10 text-destructive",
        className
      )}
      role="status"
      aria-live="polite"
    >
      {state === "saved" && (
        <>
          <Check className="h-3 w-3" />
          <span>Saved{lastSavedAt ? ` ${lastSavedAt.toLocaleTimeString()}` : ""}</span>
        </>
      )}
      {state === "typing" && <span>Typing…</span>}
      {state === "saving" && (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Saving…</span>
        </>
      )}
      {state === "offline" && (
        <>
          <CloudOff className="h-3 w-3" />
          <span>Offline — {queueCount} waiting</span>
        </>
      )}
      {state === "error" && (
        <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5">
          <AlertCircle className="h-3 w-3" />
          <span>Failed — retry</span>
        </button>
      )}
      {state === "conflict" && (
        <>
          <AlertCircle className="h-3 w-3" />
          <span>Another tab saved — review before continuing</span>
        </>
      )}
      {state === "idle" && (
        <>
          <Cloud className="h-3 w-3" />
          <span>Ready</span>
        </>
      )}
    </div>
  );
}

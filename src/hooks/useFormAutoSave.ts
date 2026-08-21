import { useCallback, useEffect, useMemo, useState } from "react";

type AutoSaveOptions<T> = {
  key: string;
  value: T;
  enabled?: boolean;
  delayMs?: number;
};

type AutoSaveSnapshot<T> = {
  value: T;
  savedAt: string;
};

const readSnapshot = <T,>(key: string): AutoSaveSnapshot<T> | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as AutoSaveSnapshot<T>) : null;
  } catch {
    return null;
  }
};

export const useFormAutoSave = <T,>({ key, value, enabled = true, delayMs = 600 }: AutoSaveOptions<T>) => {
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(() => {
    const snapshot = readSnapshot<T>(key);
    return snapshot?.savedAt ? new Date(snapshot.savedAt) : null;
  });

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const timeout = window.setTimeout(() => {
      const savedAt = new Date();
      try {
        window.localStorage.setItem(key, JSON.stringify({ value, savedAt: savedAt.toISOString() }));
        setLastSavedAt(savedAt);
      } catch {
        // Storage can be unavailable in private browsing or full-quota scenarios.
      }
    }, delayMs);

    return () => window.clearTimeout(timeout);
  }, [delayMs, enabled, key, value]);

  const restore = useCallback(() => readSnapshot<T>(key)?.value ?? null, [key]);
  const clear = useCallback(() => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(key);
    setLastSavedAt(null);
  }, [key]);

  const label = useMemo(() => {
    if (!lastSavedAt) return "Not auto-saved yet";
    return `Auto-saved at ${lastSavedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }, [lastSavedAt]);

  return { clear, lastSavedAt, label, restore };
};


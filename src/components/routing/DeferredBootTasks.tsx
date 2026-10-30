"use client";

import { useEffect, useState } from "react";
import { useServiceWorkerUpdate } from "@/hooks/useServiceWorkerUpdate";
import { useOfflinePhase1Bootstrap } from "@/offline/useOfflinePhase1Bootstrap";
import { useOfflineOutboxWorker } from "@/offline/useOfflineOutboxWorker";

/**
 * BootTasks — non-critical startup work: service-worker update checks,
 * the Phase 1 offline snapshot bootstrap, and the Phase 2 offline outbox
 * worker. None of it is needed for the first render, and all of it
 * competes with the shell boot on slow phones, so it mounts only after
 * first paint via DeferredBootTasks (§3.2.1 rule 2: non-critical work
 * starts after first paint). All three hooks are effect-only and return
 * nothing, so deferring their mount defers only their effects.
 *
 * Shared by the legacy SPA shell (`src/App.tsx`) and the migrated App
 * Router shell (`app/(app)/layout.tsx`) so both entry paths defer the
 * same work the same way.
 */
const BootTasks = () => {
  // Auto-update service worker on new deployments
  useServiceWorkerUpdate();
  // Phase 1 offline bootstrap: pull read-only snapshot into local DB when feature flag is enabled
  useOfflinePhase1Bootstrap();
  // Phase 2 outbox worker: continuously tries pending offline mutations with retry backoff
  useOfflineOutboxWorker();
  return null;
};

export const DeferredBootTasks = () => {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let idleId: number | undefined;
    let timer: number | undefined;
    const arm = () => {
      if (!cancelled) setReady(true);
    };
    // Let the first frames paint, then take an idle slot (2s cap) so the
    // boot tasks never delay the shell becoming interactive.
    const rafId = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        const w = window as unknown as {
          requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
          cancelIdleCallback?: (id: number) => void;
        };
        if (typeof w.requestIdleCallback === "function") {
          idleId = w.requestIdleCallback(arm, { timeout: 2000 });
        } else {
          timer = window.setTimeout(arm, 500);
        }
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      const w = window as unknown as { cancelIdleCallback?: (id: number) => void };
      if (idleId !== undefined && typeof w.cancelIdleCallback === "function") {
        w.cancelIdleCallback(idleId);
      }
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);
  return ready ? <BootTasks /> : null;
};

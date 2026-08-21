import { useEffect } from 'react';
import { isOfflineEligibleForCurrentUser } from './rollout';

const OUTBOX_TICK_MS = 15_000;
const OUTBOX_ERROR_BACKOFF_MS = 60_000;

/**
 * Returns true on Lovable preview/sandbox hosts where offline persistence is
 * intentionally skipped. Matches useOfflinePhase1Bootstrap so the WatermelonDB
 * adapter is never constructed inside the preview iframe, which prevents
 * "A is not a constructor" minified errors bubbling into Customers / Vehicles.
 */
function isLovablePreviewHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return (
    host.includes('lovable.app') ||
    host.includes('lovableproject.com') ||
    host.endsWith('.lovable.dev') ||
    host === 'lovable.app' ||
    host === 'lovable.dev'
  );
}

export function useOfflineOutboxWorker(): void {
  useEffect(() => {
    if (isLovablePreviewHost()) return;
    let cancelled = false;
    let timer: number | undefined;
    let nextDelay = OUTBOX_TICK_MS;

    let processOfflineOutbox: (() => Promise<void>) | null = null;
    let runOfflinePullSync: (() => Promise<void>) | null = null;
    let emitOfflineObservability: ((reason: 'outbox_tick' | 'pull_sync') => Promise<void>) | null =
      null;

    const tick = async () => {
      if (cancelled || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        return;
      }

      const eligible = await isOfflineEligibleForCurrentUser();
      if (!eligible) {
        return;
      }

      if (!processOfflineOutbox || !runOfflinePullSync || !emitOfflineObservability) {
        const [outbox, pullSync, observability] = await Promise.all([
          import('./outbox'),
          import('./database/syncPull'),
          import('./observability'),
        ]);

        processOfflineOutbox = outbox.processOfflineOutbox;
        runOfflinePullSync = pullSync.runOfflinePullSync;
        emitOfflineObservability = observability.emitOfflineObservability;
      }

      if (!processOfflineOutbox || !runOfflinePullSync || !emitOfflineObservability) {
        return;
      }

      await processOfflineOutbox();
      await runOfflinePullSync();
      await emitOfflineObservability('outbox_tick');
      nextDelay = OUTBOX_TICK_MS;
    };

    const schedule = () => {
      if (cancelled) {
        return;
      }

      tick().catch((error) => {
        nextDelay = OUTBOX_ERROR_BACKOFF_MS;
        console.error('[offline] outbox worker tick failed', error);
      });

      timer = window.setTimeout(schedule, nextDelay);
    };

    void (async () => {
      const eligible = await isOfflineEligibleForCurrentUser();
      if (cancelled || !eligible) {
        return;
      }

      schedule();
    })().catch((error) => {
      console.error('[offline] outbox worker startup failed', error);
    });

    return () => {
      cancelled = true;
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, []);
}

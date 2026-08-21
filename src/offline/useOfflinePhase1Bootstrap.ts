import { useEffect } from 'react';
import { isOfflineEligibilityConfigured, isOfflineEligibleForCurrentUser } from './rollout';

/**
 * Returns true on Lovable preview/sandbox hosts where offline persistence
 * is intentionally skipped (the SW + WatermelonDB are bypassed, so pulling
 * a snapshot is a wasted blocking call on app boot).
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

export function useOfflinePhase1Bootstrap(): void {
  useEffect(() => {
    // Synchronous short-circuits — never even hit Supabase on these hosts.
    if (isLovablePreviewHost()) return;
    if (!isOfflineEligibilityConfigured()) return;

    (async () => {
      const eligible = await isOfflineEligibleForCurrentUser();
      if (!eligible) {
        console.info('[offline] rollout disabled for current user');
        return;
      }

      const { runOfflinePullSync } = await import('./database/syncPull');
      await runOfflinePullSync();
    })().catch((error) => {
      console.error('[offline] phase 1 pull sync failed', error);
    });
  }, []);
}

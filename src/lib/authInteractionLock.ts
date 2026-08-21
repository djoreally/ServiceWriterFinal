/**
 * Interactive-auth lock.
 *
 * WHY THIS EXISTS
 * ---------------
 * The deployment sentinel (`src/lib/versionCheck.ts`) can decide that this
 * browser is running a stale, service-worker-precached bundle and force a hard
 * reload. On the production domain that check races the sign-in form: the user
 * submits credentials, the sentinel resolves, and `location.reload()` throws the
 * page away mid-request. The visible symptom is "I sign in and it instantly
 * flashes back to the sign-in screen" with no error — only on the custom domain,
 * because preview hosts skip the sentinel and unregister service workers.
 *
 * Any code that performs an interactive credential exchange takes this lock. The
 * sentinel purges caches immediately but defers its reload until the lock is
 * released, so a sign-in is never interrupted.
 */

let active = 0;
const waiters = new Set<() => void>();

function drain() {
  if (active > 0) return;
  for (const waiter of Array.from(waiters)) {
    waiters.delete(waiter);
    try {
      waiter();
    } catch {
      /* never let a waiter break auth */
    }
  }
}

/** Take the lock. Call the returned function exactly once when finished. */
export function beginAuthInteraction(): () => void {
  active += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    active = Math.max(0, active - 1);
    drain();
  };
}

/** True while at least one interactive credential exchange is in flight. */
export function isAuthInteractionActive(): boolean {
  return active > 0;
}

/**
 * Resolves immediately when idle, otherwise once the last interactive auth
 * operation releases the lock. `timeoutMs` is a safety valve so a leaked lock
 * cannot block a needed reload forever.
 */
export function whenAuthInteractionIdle(timeoutMs = 60_000): Promise<void> {
  if (active === 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      waiters.delete(finish);
      resolve();
    };
    waiters.add(finish);
    if (typeof window !== "undefined") {
      window.setTimeout(finish, timeoutMs);
    }
  });
}

/** Test helper: drop all state. */
export function resetAuthInteractionLock(): void {
  active = 0;
  waiters.clear();
}

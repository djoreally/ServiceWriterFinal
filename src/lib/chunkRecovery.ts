/**
 * Single source of truth for stale-chunk (dynamic import) recovery.
 *
 * After a deploy, a browser holding an older index.html / precached app shell
 * requests hashed chunks that no longer exist on the CDN, producing
 * "Failed to fetch dynamically imported module: /assets/X-<hash>.js".
 *
 * Recovery: unregister service workers, purge caches, then hard-reload with a
 * cache-busting param. Bounded by an attempt counter in sessionStorage so a
 * genuine outage stops instead of looping.
 */

const RELOAD_PARAM = "swr"; // service-writer reload marker (cache-buster)
const ATTEMPT_KEY = "__swr_chunk_recovery_attempts__";
const MAX_ATTEMPTS = 2;

export function isStaleChunkError(err: unknown): boolean {
  const msg =
    err instanceof Error ? `${err.name}: ${err.message}` : String(err ?? "");
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Unable to preload CSS/i.test(msg) ||
    /ChunkLoadError/i.test(msg)
  );
}

function readAttempts(): number {
  try {
    return Number(sessionStorage.getItem(ATTEMPT_KEY) ?? "0") || 0;
  } catch {
    return 0;
  }
}

function writeAttempts(n: number): void {
  try {
    sessionStorage.setItem(ATTEMPT_KEY, String(n));
  } catch {
    /* storage blocked — recovery still runs once via the URL param */
  }
}

/** Clear the attempt counter once the app has successfully booted. */
export function markChunkRecoverySuccess(): void {
  try {
    if (sessionStorage.getItem(ATTEMPT_KEY)) sessionStorage.removeItem(ATTEMPT_KEY);
  } catch {
    /* noop */
  }
}

/** True when another recovery reload is still allowed. */
export function canRecoverFromStaleChunk(): boolean {
  if (typeof window === "undefined") return false;
  return readAttempts() < MAX_ATTEMPTS;
}

/**
 * Purge service workers + caches and hard-reload with a cache-busting param.
 * Returns false when the attempt budget is exhausted (caller should surface an
 * error UI instead of reloading forever).
 */
export function recoverFromStaleChunk(): boolean {
  if (typeof window === "undefined") return false;
  const attempts = readAttempts();
  if (attempts >= MAX_ATTEMPTS) return false;
  writeAttempts(attempts + 1);

  const url = new URL(window.location.href);
  url.searchParams.set(RELOAD_PARAM, Date.now().toString(36));

  void (async () => {
    if ("serviceWorker" in navigator) {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
      } catch {
        /* noop */
      }
    }
    if (typeof caches !== "undefined") {
      try {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n).catch(() => false)));
      } catch {
        /* noop */
      }
    }
    window.location.replace(url.toString());
  })();

  return true;
}

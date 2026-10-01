import { ComponentType, lazy } from "react";
import {
  isStaleChunkError,
  markChunkRecoverySuccess,
  recoverFromStaleChunk,
} from "@/lib/chunkRecovery";

/**
 * Retry wrapper for dynamic imports.
 * On flaky networks the initial fetch can fail — retry with backoff.
 * When the module URL is missing entirely (deploy shipped a new bundle and the
 * client still holds a stale index.html referencing old chunk hashes), delegate
 * to the shared chunk-recovery helper: purge SW + caches, then hard reload with
 * a cache-busting param (bounded attempt counter prevents reload loops).
 */
// Component props are inferred from each factory's concrete component type.

export function lazyRetry<T extends ComponentType<never>>(
  factory: () => Promise<{ default: T }>,
  retries = 2,
): React.LazyExoticComponent<T> {
  return lazy(() => {
    const attempt = (remaining: number): Promise<{ default: T }> =>
      factory().catch((err) => {
        if (remaining <= 0) {
          if (isStaleChunkError(err) && recoverFromStaleChunk()) {
            // Never-resolving: keep Suspense fallback visible while the
            // browser navigates to the fresh HTML.
            return new Promise<{ default: T }>(() => {});
          }
          throw err;
        }
        const retryDelay = typeof process !== "undefined" && process.env.NODE_ENV === "test" ? 0 : 800;
        return new Promise<{ default: T }>((resolve) =>
          setTimeout(() => resolve(attempt(remaining - 1)), retryDelay),
        );
      });
    return attempt(retries);
  });
}

// Catch stale-chunk errors outside React.lazy (route prefetch, event-driven
// imports) and trigger the same one-shot reload.
if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (e) => {
    if (recoverFromStaleChunk()) e.preventDefault();
  });
  window.addEventListener("unhandledrejection", (e) => {
    if (isStaleChunkError((e as PromiseRejectionEvent).reason) && recoverFromStaleChunk()) {
      e.preventDefault();
    }
  });
  // App code executed — the bundle is healthy, reset the recovery budget.
  markChunkRecoverySuccess();
}

import { useEffect } from 'react';

const APP_CACHE_PREFIX = 'service-writer-app';
const APP_VERSION = 'dev';

/**
 * Service worker update hook
 * - production-only polling
 * - auto-applies updates
 * - stale cache protection by app version
 */
export function useServiceWorkerUpdate() {
  const isProduction = typeof window !== 'undefined' && window.location.protocol === 'https:' && !window.location.hostname.includes('localhost');

  // Preview deployments change frequently. Registering a worker there can claim
  // the current login page while a person is entering credentials, which used to
  // trigger a full reload and clear the form. Previews explicitly unregister any
  // worker left by an earlier deployment instead.
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const isPreviewHost =
    host.startsWith('id-preview--') ||
    host.startsWith('preview--') ||
    host.endsWith('.vercel.app');

  const isIframe = typeof window !== 'undefined' && window.self !== window.top;
  const swDisabled = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('sw') === 'off';
  const skipSW = !isProduction || isPreviewHost || isIframe || swDisabled;

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (skipSW) {
      void navigator.serviceWorker.getRegistrations().then((registrations) =>
        Promise.all(registrations
          .filter((registration) => new URL(registration.scope).origin === window.location.origin)
          .map((registration) => registration.unregister())),
      );
      return;
    }
    let interval: number | undefined;
    let active = true;
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((registration) => {
      if (!active) return;
      void registration.update();
      interval = window.setInterval((): void => {
        void registration.update();
      }, 30_000);
    }).catch((error: unknown) => {
      // Service worker support is optional; the application remains usable
      // without offline caching or background update checks.
      console.warn('Service Worker registration skipped:', error);
    });
    return () => {
      active = false;
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [skipSW]);

  // Do not reload on `controllerchange`. Service workers can activate while a
  // form is in progress (notably immediately after sign-in), and a forced reload
  // discards the user's state. Updated workers take effect for later navigation;
  // stale lazy chunks are handled by the bounded chunk-recovery path instead.

  useEffect(() => {
    if (skipSW || !('caches' in window)) return;

    const keep = `${APP_CACHE_PREFIX}-${APP_VERSION}`;

    void caches.keys().then((names) => {
      for (const name of names) {
        const isAppCache = name.startsWith(APP_CACHE_PREFIX) || name.includes('workbox');
        const isCurrent = name.includes(APP_VERSION) || name === keep;
        if (isAppCache && !isCurrent) {
          void caches.delete(name);
        }
      }
    });
  }, [skipSW]);

  return { needRefresh: false };
}

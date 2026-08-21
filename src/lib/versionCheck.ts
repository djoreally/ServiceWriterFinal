/**
 * Deployment sentinel: on production boot, fetch version and app identity with
 * no-store and compare them to the values compiled into this bundle.
 *
 * If they differ, the browser is running an old service-worker precached bundle
 * from a previous deploy. Unregister service workers, purge caches, and hard
 * reload once so the very next paint uses fresh code.
 *
 * Two rules keep this from eating a sign-in (the "flashes back to the sign-in
 * screen on the custom domain" bug):
 *   1. `main.tsx` awaits this (bounded) BEFORE mounting the auth provider, so
 *      the reload normally happens before any form exists.
 *   2. If it resolves late anyway, the reload waits for the interactive-auth
 *      lock to clear instead of discarding an in-flight credential exchange.
 *
 * Runs at most once per page load and is a no-op in dev / on Lovable preview
 * hosts (to avoid interfering with HMR and the preview iframe).
 */

import { whenAuthInteractionIdle } from "@/lib/authInteractionLock";

const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";

const BACKEND_PROJECT_ID = typeof __BACKEND_PROJECT_ID__ === "string" ? __BACKEND_PROJECT_ID__ : "";
const APP_PROJECT_ID = typeof __LOVABLE_PROJECT_ID__ === "string" ? __LOVABLE_PROJECT_ID__ : "";
const APP_SLUG = typeof __APP_SLUG__ === "string" ? __APP_SLUG__ : "";
const RELOAD_FLAG = "__sw_version_reload__";

function isPreviewHost(): boolean {
  if (typeof window === "undefined") return true;
  const host = window.location.hostname;
  return (
    host.endsWith(".lovable.app") ||
    host.endsWith(".lovableproject.com") ||
    host.endsWith(".lovable.dev") ||
    host === "localhost" ||
    host === "127.0.0.1"
  );
}

export async function checkAppVersion(): Promise<void> {
  if (!import.meta.env.PROD) return;
  if (isPreviewHost()) return;
  if (typeof window === "undefined") return;

  // Loop guard: only skip if this session already reloaded twice.
  const attempts = Number(sessionStorage.getItem(RELOAD_FLAG) ?? "0") || 0;
  if (attempts >= 2) return;


  try {
    const requestOptions: RequestInit = { cache: "no-store", credentials: "omit" };
    const nonce = Date.now();
    const [versionResponse, identityResponse] = await Promise.all([
      fetch(`/version.json?_=${nonce}`, requestOptions),
      fetch(`/app-identity.json?_=${nonce}`, requestOptions),
    ]);
    if (!versionResponse.ok || !identityResponse.ok) return;
    const { version } = (await versionResponse.json()) as { version?: string };
    const identity = (await identityResponse.json()) as {
      version?: string;
      projectId?: string;
      appSlug?: string;
      backendProjectId?: string;
    };
    const deploymentMatches =
      version === APP_VERSION &&
      identity.version === APP_VERSION &&
      identity.projectId === APP_PROJECT_ID &&
      identity.appSlug === APP_SLUG &&
      identity.backendProjectId === BACKEND_PROJECT_ID;
    if (deploymentMatches) return;

    console.info(
      `[deployment] identity/version mismatch — forcing fresh load`,
    );

    sessionStorage.setItem(RELOAD_FLAG, String(attempts + 1));

    // Best-effort: unregister every service worker, then drop caches.
    if ("serviceWorker" in navigator) {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
      } catch {
        /* noop */
      }
    }
    if ("caches" in window) {
      try {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n).catch(() => false)));
      } catch {
        /* noop */
      }
    }

    // Never discard an in-flight sign-in: caches are already purged, so the
    // reload can safely wait until the credential exchange finishes.
    await whenAuthInteractionIdle();
    window.location.reload();

  } catch {
    /* offline or version.json missing — safe no-op */
  }
}

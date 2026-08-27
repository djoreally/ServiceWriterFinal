/**
 * Compatibility wrappers for the canonical PWA push registration flow.
 *
 * All registration is now handled by tech-push.ts, which obtains the public
 * VAPID key from the same-origin endpoint and persists subscriptions through
 * the authenticated Supabase client.
 */
import {
  getPushRegistrationState,
  registerTechPushDevice,
  type PushRegistrationState,
} from "@/lib/tech-push";

export type { PushRegistrationState };
export { getPushRegistrationState };

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (error) {
    console.error("[Push] Failed to register service worker", error);
    return null;
  }
}

export async function subscribeToPush(): Promise<PushSubscription | null> {
  const endpoint = await registerTechPushDevice();
  if (!endpoint || typeof navigator === "undefined") return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

/**
 * Retained for callers from the old API. The canonical registration function
 * persists the subscription itself, so this is deliberately a no-op success
 * for an already-created browser subscription.
 */
export async function sendSubscriptionToServer(subscription: PushSubscription): Promise<boolean> {
  return Boolean(subscription?.endpoint);
}

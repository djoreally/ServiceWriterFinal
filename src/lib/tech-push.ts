/**
 * Technician Web Push registration.
 *
 * The VAPID public key is fetched from the edge function (never hardcoded), and the
 * subscription is stored per technician so the server can reach a specific device.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export type PushRegistrationState = "unsupported" | "denied" | "granted" | "prompt";

export function getPushRegistrationState(): PushRegistrationState {
  if (typeof window === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission === "granted") return "granted";
  return "prompt";
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

function arrayBufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Subscribes this device for mission notifications. Returns null when push is
 * unavailable or the technician declined — callers should treat that as a no-op,
 * not an error, because push is an enhancement over the in-app mission board.
 */
export async function registerTechPushDevice(): Promise<string | null> {
  if (getPushRegistrationState() === "unsupported") return null;

  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return null;

  const registration = await navigator.serviceWorker.ready;

  const { data, error } = await supabase.functions.invoke("send-tech-push", {
    body: { action: "public_key" },
  });
  const publicKey = (data as { publicKey?: string } | null)?.publicKey;
  if (error || !publicKey) return null;

  let subscription = await registration.pushManager.getSubscription();
  if (subscription && arrayBufferToBase64Url(subscription.options.applicationServerKey ?? null) !== publicKey) {
    // Key rotated: drop the stale subscription so the device is not silently unreachable.
    await subscription.unsubscribe();
    subscription = null;
  }

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
    });
  }

  const p256dh = arrayBufferToBase64Url(subscription.getKey("p256dh"));
  const authKey = arrayBufferToBase64Url(subscription.getKey("auth"));
  if (!p256dh || !authKey) return null;

  const { data: auth } = await getCurrentAuthUser();
  const userId = auth.user?.id;
  if (!userId) return null;

  const { error: saveError } = await (supabase as any)
    .from("tech_push_subscriptions")
    .upsert(
      {
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh,
        auth_key: authKey,
        user_agent: navigator.userAgent.slice(0, 300),
        disabled_at: null,
      },
      { onConflict: "endpoint" },
    );

  if (saveError) return null;
  return subscription.endpoint;
}

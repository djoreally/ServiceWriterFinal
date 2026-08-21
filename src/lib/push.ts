// Client-side helper for Web Push subscriptions
// Usage: call registerForPush() after a user gesture (button click)

const VAPID_PUBLIC = "REPLACE_WITH_VAPID_PUBLIC"; // replace with generated public key or use env to inject

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    return reg;
  } catch (err) {
    console.error('Failed to register service worker', err);
    return null;
  }
}

export function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function subscribeToPush(): Promise<PushSubscription | null> {
  try {
    const reg = await registerServiceWorker();
    if (!reg) return null;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    });

    return subscription;
  } catch (err) {
    console.error('subscribeToPush failed', err);
    return null;
  }
}

export async function sendSubscriptionToServer(subscription: PushSubscription) {
  try {
    // POST to the register-push function
    const res = await fetch('/.netlify/functions/register-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription }),
    });
    return res.ok;
  } catch (err) {
    console.error('sendSubscriptionToServer failed', err);
    return false;
  }
}

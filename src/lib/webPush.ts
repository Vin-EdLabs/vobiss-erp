/**
 * Native Web Push (VAPID) — no Firebase required.
 * Registers a dedicated SW (/push-sw.js) at scope /vobiss-push/ so it coexists
 * with the Vite PWA service worker.
 */

import { getPushPublicKey, subscribePush, unsubscribePush } from '@/api';

const SW_PATH = '/push-sw.js';
const SW_SCOPE = '/vobiss-push/';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/** True once a subscription's own key stops matching the server's current VAPID public key —
 *  e.g. after the keys were rotated. A browser won't let you subscribe() with a new key while
 *  an old-key subscription still exists (it throws), so this is what tells enablePushNotifications
 *  it needs to unsubscribe first rather than just reusing (and re-saving) the now-dead one. */
function subscriptionKeyMatches(sub: PushSubscription, currentKey: Uint8Array): boolean {
  const existing = sub.options?.applicationServerKey;
  if (!existing) return true; // can't compare — assume fine rather than force a needless resubscribe
  const existingBytes = new Uint8Array(existing);
  if (existingBytes.length !== currentKey.length) return false;
  return existingBytes.every((b, i) => b === currentKey[i]);
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function permissionState(): NotificationPermission {
  if (typeof Notification === 'undefined') return 'denied';
  return Notification.permission;
}

async function getPushRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    // Re-use an existing registration if present, otherwise register.
    const existing = await navigator.serviceWorker.getRegistration(SW_SCOPE);
    if (existing) return existing;
    return await navigator.serviceWorker.register(SW_PATH, { scope: SW_SCOPE });
  } catch (e) {
    console.error('[webPush] SW register failed:', e);
    return null;
  }
}

/**
 * Returns true on success. Asks for permission, registers the SW, subscribes,
 * and sends the subscription to the backend.
 */
export async function enablePushNotifications(): Promise<boolean> {
  if (!isPushSupported()) return false;

  // 1) Permission
  let perm = Notification.permission;
  if (perm === 'default') {
    perm = await Notification.requestPermission();
  }
  if (perm !== 'granted') return false;

  // 2) Public key
  const { key, configured } = await getPushPublicKey().catch(() => ({ key: '', configured: false }));
  if (!configured || !key) {
    console.warn('[webPush] backend missing VAPID keys');
    return false;
  }

  // 3) SW + subscription
  const reg = await getPushRegistration();
  if (!reg) return false;

  const currentKey = urlBase64ToUint8Array(key);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !subscriptionKeyMatches(sub, currentKey)) {
    // Stale subscription from before a VAPID key rotation — the server can never sign a valid
    // push for it again (it'll just 403 forever), and the browser refuses to subscribe() with a
    // different key while this one still exists, so it has to go before a working one can exist.
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: currentKey,
    });
  }

  // 4) Save on backend
  await subscribePush(sub);
  return true;
}

export async function disablePushNotifications(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE);
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    try {
      await unsubscribePush(sub.endpoint);
    } catch {/* ignore */}
    await sub.unsubscribe();
  }
}

/**
 * Returns true if the user already has an active subscription on this device.
 */
export async function isCurrentlySubscribed(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;
  const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE);
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  return Boolean(sub);
}

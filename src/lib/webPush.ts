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

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
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

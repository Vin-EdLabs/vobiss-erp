import { createElement } from 'react';
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { registerFcmToken } from '../api';
import { getMessaging, getToken, isSupported, type Messaging } from 'firebase/messaging';
import { playDoubleBeep } from './beep';
import { toast } from '../hooks/use-toast';
import { ToastAction } from '../components/ui/toast';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

let app: FirebaseApp | null = null;

function getFirebaseApp(): FirebaseApp | null {
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) return null;
  if (!app) {
    app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig as Required<typeof firebaseConfig>);
  }
  return app;
}

export async function isFirebaseMessagingConfigured(): Promise<boolean> {
  if (!(await isSupported())) return false;
  return Boolean(getFirebaseApp() && vapidKey);
}

let pushMessageListenerAttached = false;

/**
 * The service worker (backend/server.js's /firebase-messaging-sw.js) always shows the real
 * system notification itself now, regardless of whether a tab is open — that's what makes this
 * behave like WhatsApp instead of going silent whenever the app happens to be open in some
 * background tab or window. It also posts the same payload to every open tab via
 * `postMessage`, which is what this listens for, purely to refresh this tab's toast/bell/badge
 * immediately instead of waiting on the next poll.
 */
function attachPushMessageListener() {
  if (pushMessageListenerAttached || !navigator.serviceWorker) return;
  pushMessageListenerAttached = true;

  navigator.serviceWorker.addEventListener('message', (event) => {
    const msg = event.data as { type?: string; title?: string; body?: string; data?: Record<string, string> } | null;
    if (!msg || msg.type !== 'vobiss-push') return;

    const title = msg.title || 'Vobiss';
    const body = msg.body || '';
    const url = msg.data?.url || msg.data?.link || '/';
    const type = msg.data?.type;

    playDoubleBeep();
    toast({
      title,
      description: body,
      action: createElement(
        ToastAction,
        {
          altText: 'Open',
          onClick: () => {
            window.location.href = url;
          },
        },
        'Open'
      ),
    });

    // Same badge-refresh convention the rest of the app already uses for realtime updates
    // (see Sidebar.tsx) — this just makes a push arriving with the tab open just as immediate.
    if (type === 'chat_message' || type === 'chat_mention') {
      window.dispatchEvent(new CustomEvent('chat:unread-changed'));
    } else {
      window.dispatchEvent(new CustomEvent('staff:notifications-changed'));
    }
  });
}

/**
 * Calling register() again for an already-active worker at the same URL/scope is how you ask
 * the browser to re-check for a newer version — it's a cheap no-op otherwise. Without this,
 * a device that already granted permission would only ever get that check from the browser's
 * own best-effort ~24h background timer, which isn't reliable for a PWA that goes untouched for
 * days or weeks — exactly the case a fix here needs to actually reach. Call this on every app
 * load (not just when first granting permission) so the check happens every time someone
 * actually opens the app, whenever that is.
 */
export async function refreshPushServiceWorker(): Promise<void> {
  if (!(await isSupported()) || !navigator.serviceWorker) return;
  try {
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/firebase-cloud-messaging-push-scope',
    });
    await registration.update();
    attachPushMessageListener();
  } catch {
    /* best-effort — a normal enable/registerDeviceForPush() still runs on its own path */
  }
}

export async function registerDeviceForPush(): Promise<string | null> {
  const supported = await isSupported();
  if (!supported || !vapidKey) return null;

  const fbApp = getFirebaseApp();
  if (!fbApp) return null;

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
    scope: '/firebase-cloud-messaging-push-scope',
  });

  const messaging: Messaging = getMessaging(fbApp);
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
  if (token) {
    await registerFcmToken(token);
  }

  attachPushMessageListener();

  return token;
}

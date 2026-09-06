import { createElement } from 'react';
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { registerFcmToken } from '../api';
import { getMessaging, getToken, isSupported, onMessage, type Messaging } from 'firebase/messaging';
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

  onMessage(messaging, (payload) => {
    const title = payload.notification?.title || 'Vobiss';
    const body = payload.notification?.body || '';
    const url = (payload.data?.url as string) || (payload.data?.link as string) || '/';
    const type = payload.data?.type as string | undefined;

    // The tab is open and focused right now — FCM only calls onMessage() in the foreground; a
    // system popup here would be redundant with the app already on screen (and iOS Safari
    // actively suppresses foreground Notification() calls), so this shows an in-app toast plus
    // an immediate bell/unread-badge refresh instead. Background delivery still goes through
    // firebase-messaging-sw.js's onBackgroundMessage, which keeps the real system notification.
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

  return token;
}

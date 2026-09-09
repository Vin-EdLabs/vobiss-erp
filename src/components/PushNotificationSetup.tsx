import React, { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  isPushSupported,
  permissionState,
  enablePushNotifications,
  isCurrentlySubscribed,
} from '@/lib/webPush';
import { registerDeviceForPush, refreshPushServiceWorker } from '@/lib/firebaseMessaging';
import { getPushPublicKey } from '@/api';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

// Session-only: hides the card for the rest of THIS login after "Not now", but — unlike a
// permanent flag — it does not survive a fresh login, so a user who still hasn't granted
// permission gets asked again next time they sign in instead of being silenced forever.
const STORAGE_KEY = 'vobiss_push_prompt_dismissed';

/**
 * Optional FCM setup — only shown when Firebase env vars are present.
 */
export function PushNotificationSetup({ className }: { className?: string }) {
  const { token, user } = useAuth();
  const [ready, setReady] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(false);
  const [granted, setGranted] = useState(
    typeof Notification !== 'undefined' ? Notification.permission === 'granted' : false
  );
  const [dismissed, setDismissed] = useState(() =>
    typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(STORAGE_KEY) === '1' : false
  );

  const requestPush = async () => {
    setLoading(true);
    try {
      // Both channels share one permission prompt/click — the backend fans a push out to
      // whichever of these actually has a live token/subscription for the user (see
      // backend/push/sendPush.js), so registering both here just gives it more delivery
      // paths per device, not duplicate notifications.
      const [webPushOk, fcmToken] = await Promise.all([
        enablePushNotifications(),
        registerDeviceForPush().catch((e) => {
          console.warn('[push] FCM registration failed:', e);
          return null;
        }),
      ]);
      setGranted(webPushOk || !!fcmToken || permissionState() === 'granted');
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isPushSupported()) {
        if (!cancelled) {
          setConfigured(false);
          setReady(true);
        }
        return;
      }
      try {
        const { configured: cfg } = await getPushPublicKey();
        const subscribed = await isCurrentlySubscribed();
        const alreadyGranted = subscribed || permissionState() === 'granted';
        if (!cancelled) {
          setConfigured(cfg);
          setGranted(alreadyGranted);
          setReady(true);
        }
        // Fire the real browser permission prompt automatically on login when the user has
        // never been asked ('default' — as opposed to a past explicit 'denied', which the
        // browser itself will refuse to re-prompt for until the user resets it in site
        // settings). This is what makes "ask every login until allowed" actually happen,
        // instead of waiting on a click the user may never make.
        if (!cancelled && cfg && !alreadyGranted && permissionState() === 'default') {
          requestPush();
        } else if (!cancelled && cfg && alreadyGranted) {
          // Already granted on a past visit — no permission prompt needed, but this is the one
          // reliable moment (the app actually being opened) to quietly re-validate both push
          // channels: ask the browser to re-check for a newer service worker (Firebase), and
          // confirm the native webpush subscription still matches the server's current VAPID
          // key — replacing it if a key rotation left it stale, instead of it just failing
          // silently forever. Neither touches loading/UI state; this runs in the background.
          void refreshPushServiceWorker();
          void enablePushNotifications().catch(() => {});
        }
      } catch {
        if (!cancelled) {
          setConfigured(false);
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (!token || !ready || !configured || dismissed) return null;

  return (
    <div
      className={cn(
        'mx-auto max-w-lg rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-800 p-4 text-slate-50 shadow-lg dark:border-slate-700',
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
          {granted ? <Bell className="h-5 w-5 text-emerald-300" /> : <BellOff className="h-5 w-5 text-amber-200" />}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-semibold leading-tight">Stay updated with push alerts</p>
          <p className="text-xs leading-relaxed text-slate-300">
            Approvals, cash decisions, announcements, and ticket updates — even when the app is in the background.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              disabled={loading || granted}
              className="rounded-full bg-emerald-500 text-white hover:bg-emerald-600"
              onClick={requestPush}
            >
              {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              {granted ? 'Notifications on' : 'Enable notifications'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="rounded-full text-slate-200 hover:bg-white/10 hover:text-white"
              onClick={() => {
                sessionStorage.setItem(STORAGE_KEY, '1');
                setDismissed(true);
              }}
            >
              Not now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

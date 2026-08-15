import React, { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  isPushSupported,
  permissionState,
  enablePushNotifications,
  isCurrentlySubscribed,
} from '@/lib/webPush';
import { getPushPublicKey } from '@/api';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

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
    typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) === '1' : false
  );

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
        if (!cancelled) {
          setConfigured(cfg);
          setGranted(subscribed || permissionState() === 'granted');
          setReady(true);
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
              onClick={async () => {
                setLoading(true);
                try {
                  const ok = await enablePushNotifications();
                  setGranted(ok || permissionState() === 'granted');
                } catch (e) {
                  console.error(e);
                } finally {
                  setLoading(false);
                }
              }}
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
                localStorage.setItem(STORAGE_KEY, '1');
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

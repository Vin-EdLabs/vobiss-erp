import React, { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

/**
 * vite-plugin-pwa's useRegisterSW returns needRefresh/offlineReady as [boolean, Dispatch] tuples
 * (same pattern as useState), not plain booleans.
 */
export function PWAUpdateToast() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  const {
    needRefresh: [needRefresh],
    offlineReady: [_offlineReady],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      setRegistration(reg ?? null);
    },
    onRegisterError(error) {
      console.warn('[PWA] register error', error);
    },
  });

  useEffect(() => {
    if (!registration) return;
    const check = () => void registration.update().catch(() => {});
    const id = window.setInterval(check, 60 * 60 * 1000);
    window.addEventListener('focus', check);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', check);
    };
  }, [registration]);

  // registerType is "autoUpdate", so don't wait on a click here — a user who never notices (or
  // never can, if a broken cached version is what's keeping the page blank in the first place)
  // would otherwise be stuck indefinitely. This still renders the toast below for the brief
  // moment before the reload, so it's visible rather than a silent flash.
  useEffect(() => {
    if (!needRefresh) return;
    void (async () => {
      try {
        await updateServiceWorker();
      } finally {
        window.location.reload();
      }
    })();
  }, [needRefresh, updateServiceWorker]);

  if (!needRefresh) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[100] flex justify-center px-3">
      <div className="pointer-events-auto flex max-w-md flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-2xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
        <RefreshCw className="h-4 w-4 shrink-0 text-slate-600 dark:text-slate-300" />
        <p className="text-sm text-slate-700 dark:text-slate-200">A new version is ready.</p>
        <Button
          size="sm"
          className="rounded-full"
          onClick={() => {
            void (async () => {
              try {
                await updateServiceWorker();
              } finally {
                window.location.reload();
              }
            })();
          }}
        >
          Update now
        </Button>
      </div>
    </div>
  );
}

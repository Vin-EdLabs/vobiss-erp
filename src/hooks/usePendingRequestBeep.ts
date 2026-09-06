import { useEffect, useRef } from 'react';
import { playBeep } from '@/lib/beep';

/**
 * Repeats a beep every `intervalMinutes` while `pendingCount > 0` and the tab is the one the
 * user is actually looking at — stops the moment the count drops to 0 (the request got
 * actioned) or the tab goes to the background, and never beeps immediately on mount (that would
 * fire on every page load/count change, not just "it's been sitting here a while").
 */
export function usePendingRequestBeep(pendingCount: number, intervalMinutes = 5): void {
  const countRef = useRef(pendingCount);
  countRef.current = pendingCount;

  useEffect(() => {
    if (pendingCount <= 0) return;

    const tick = () => {
      if (countRef.current > 0 && document.visibilityState === 'visible') {
        playBeep(660, 220);
      }
    };
    const id = window.setInterval(tick, Math.max(1, intervalMinutes) * 60 * 1000);
    return () => window.clearInterval(id);
    // Only (re)start the interval when pending work first appears/disappears, not on every
    // count fluctuation while it's already ticking — restarting mid-cycle would keep resetting
    // the wait and effectively silence the reminder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCount > 0, intervalMinutes]);
}

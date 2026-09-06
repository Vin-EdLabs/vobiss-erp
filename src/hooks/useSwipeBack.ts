import { useEffect, useRef } from 'react';

/**
 * Edge-swipe-right-to-go-back, the gesture iOS/Android give you for free in a real browser tab
 * — except a PWA opened from the home screen (display: standalone) has no browser chrome, so
 * that native gesture never fires there. This reimplements just enough of it: a swipe starting
 * near the left edge, moving mostly rightward, far enough to clearly be intentional and not a
 * vertical scroll, calls `onBack`. Attach the returned ref to the screen you want swipeable.
 */
export function useSwipeBack<T extends HTMLElement>(onBack: () => void, enabled: boolean) {
  const ref = useRef<T | null>(null);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    const EDGE_ZONE_PX = 32; // must start near the left edge, like the native gesture
    const MIN_DISTANCE_PX = 80;
    const MAX_VERTICAL_DRIFT_PX = 60;

    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      tracking = t.clientX <= EDGE_ZONE_PX;
      startX = t.clientX;
      startY = t.clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking) return;
      const t = e.touches[0];
      if (!t) return;
      // Once it's clearly a vertical scroll, stop treating this touch as a back-swipe candidate.
      if (Math.abs(t.clientY - startY) > MAX_VERTICAL_DRIFT_PX) tracking = false;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      if (dx > MIN_DISTANCE_PX && dy < MAX_VERTICAL_DRIFT_PX) {
        onBackRef.current();
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [enabled]);

  return ref;
}

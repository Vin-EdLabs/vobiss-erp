/**
 * Tiny wrapper around the App Badging API.
 * - Works on installed PWAs (Chrome/Edge on Windows/macOS, Chrome on Android).
 * - Silently no-ops on browsers that don't support it (iOS Safari, Firefox).
 * - Shows on the taskbar / dock / home-screen icon.
 */

type NavigatorWithBadge = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export function isBadgeSupported(): boolean {
  if (typeof navigator === 'undefined') return false;
  return 'setAppBadge' in (navigator as NavigatorWithBadge);
}

export async function setAppBadge(count: number): Promise<void> {
  if (!isBadgeSupported()) return;
  const nav = navigator as NavigatorWithBadge;
  try {
    if (count > 0 && nav.setAppBadge) {
      await nav.setAppBadge(count);
    } else if (nav.clearAppBadge) {
      await nav.clearAppBadge();
    }
  } catch {
    /* ignore */
  }
}

export async function clearAppBadge(): Promise<void> {
  if (!isBadgeSupported()) return;
  const nav = navigator as NavigatorWithBadge;
  try {
    if (nav.clearAppBadge) await nav.clearAppBadge();
  } catch {
    /* ignore */
  }
}

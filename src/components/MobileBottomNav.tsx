import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CalendarCheck, Home, Menu, MessagesSquare, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const ITEMS = [
  { id: 'home', label: 'Home', to: '/workspace', icon: Home },
  { id: 'workspace', label: 'Workspace', to: '/chat', icon: MessagesSquare },
  { id: 'attendance', label: 'Attendance', to: '/hr-self/attendance', icon: CalendarCheck },
  { id: 'profile', label: 'Profile', to: '/profile', icon: User },
] as const;

/** Hides the nav while the user is actively scrolling down (reading content), and brings it
 *  back on any scroll-up or once scrolling stops — same feel as Instagram/most native apps.
 *  The page's actual scroll container is <main class="staff-main-scroll ..."> (see Index.tsx),
 *  not window — attaches directly to it (found by class, polling briefly in case this nav
 *  mounts before that particular <main> does) rather than relying on document-capture, which
 *  is a less common pattern for a non-bubbling event and harder to reason about/debug. */
function useHideOnScroll(): boolean {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  const idleTimer = useRef<number>();

  useEffect(() => {
    let container: Element | null = null;
    let attached: (() => void) | null = null;
    let findTimer: number | undefined;

    const handleScroll = () => {
      const y = container instanceof HTMLElement ? container.scrollTop : 0;
      const delta = y - lastY.current;
      lastY.current = y;

      if (Math.abs(delta) > 4) {
        setHidden(delta > 0 && y > 40);
      }

      window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => setHidden(false), 600);
    };

    const tryAttach = () => {
      container = document.querySelector('.staff-main-scroll');
      if (container) {
        container.addEventListener('scroll', handleScroll, { passive: true });
        attached = () => container?.removeEventListener('scroll', handleScroll);
      } else {
        findTimer = window.setTimeout(tryAttach, 200);
      }
    };
    tryAttach();

    return () => {
      window.clearTimeout(findTimer);
      window.clearTimeout(idleTimer.current);
      attached?.();
    };
  }, []);

  return hidden;
}

export function MobileBottomNav({ onMore }: { onMore: () => void }) {
  const location = useLocation();
  const hidden = useHideOnScroll();

  return (
    <nav
      className="staff-bottom-nav flex md:hidden"
      style={{
        position: 'fixed',
        left: '50%',
        // Floats clear of the edge (and the home-bar/notch) instead of sitting flush against
        // it, but stays close — a small, unobtrusive dock rather than a big bar.
        bottom: 'calc(env(safe-area-inset-bottom) + 8px)',
        zIndex: 40,
        alignItems: 'center',
        gap: '2px',
        padding: '4px',
        borderRadius: '9999px',
        background: 'color-mix(in srgb, var(--surface) 82%, transparent)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid color-mix(in srgb, var(--border) 70%, transparent)',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.16), 0 2px 6px rgba(0, 0, 0, 0.08)',
        transform: hidden ? 'translate(-50%, calc(100% + 24px))' : 'translate(-50%, 0)',
        opacity: hidden ? 0 : 1,
        transition: 'transform 280ms ease, opacity 280ms ease',
      }}
    >
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const active =
          location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
        return (
          <Link
            key={item.id}
            to={item.to}
            className="relative flex h-11 w-11 shrink-0 items-center justify-center"
          >
            <span
              className={cn(
                'absolute inset-0 rounded-full transition-all duration-300 ease-out',
                active ? 'scale-100 bg-[var(--primary)] opacity-100' : 'scale-75 opacity-0'
              )}
            />
            <Icon
              className={cn(
                'relative h-[18px] w-[18px] transition-colors duration-200',
                active ? 'text-[var(--primary-text)]' : 'text-[var(--text-muted)]'
              )}
            />
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onMore}
        className="relative flex h-11 w-11 shrink-0 items-center justify-center"
      >
        <Menu className="relative h-[18px] w-[18px] text-[var(--text-muted)]" />
      </button>
    </nav>
  );
}

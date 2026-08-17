import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CalendarCheck, Home, Menu, MessagesSquare, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const ITEMS = [
  { id: 'home', label: 'Home', to: '/workspace', icon: Home },
  { id: 'workspace', label: 'Workspace', to: '/chat', icon: MessagesSquare },
  { id: 'attendance', label: 'Attendance', to: '/hr-self/attendance', icon: CalendarCheck },
  { id: 'profile', label: 'Profile', to: '/profile', icon: User },
] as const;

export function MobileBottomNav({ onMore }: { onMore: () => void }) {
  const location = useLocation();

  return (
    <nav
      className="staff-bottom-nav flex md:hidden"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 40,
        height: 'calc(56px + env(safe-area-inset-bottom))',
        paddingBottom: 'env(safe-area-inset-bottom)',
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.08)',
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
            className={cn(
              'flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium',
              active ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'
            )}
          >
            <Icon className="h-5 w-5" />
            {item.label}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onMore}
        className="flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-[var(--text-muted)]"
      >
        <Menu className="h-5 w-5" />
        More
      </button>
    </nav>
  );
}

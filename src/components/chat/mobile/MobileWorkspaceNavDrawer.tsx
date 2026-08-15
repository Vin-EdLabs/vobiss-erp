import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  X,
  LayoutDashboard,
  Ticket,
  FileText,
  DollarSign,
  FolderKanban,
  MessageCircle,
  Settings,
  ClipboardList,
  Bell,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getWorkspaceQuickLinks, resolvePrimaryRole } from '@/config/roles';
import { cn } from '@/lib/utils';

const NAV_ICONS: Record<string, React.ElementType> = {
  '/workspace': LayoutDashboard,
  '/chat': MessageCircle,
  '/staff/cx/tickets': Ticket,
  '/staff/noc/tickets': Ticket,
  '/request-forms': FileText,
  '/cash-request': DollarSign,
  '/material-approvals': ClipboardList,
  '/cash-approvals': DollarSign,
  '/profile': Settings,
};

function iconFor(path: string) {
  if (path.includes('ticket')) return Ticket;
  if (path.includes('project')) return FolderKanban;
  return NAV_ICONS[path] || FileText;
}

export function MobileWorkspaceNavDrawer({
  open,
  onClose,
  unreadChat = 0,
  theme,
}: {
  open: boolean;
  onClose: () => void;
  unreadChat?: number;
  theme: 'light' | 'dark';
}) {
  const { user } = useAuth();
  const location = useLocation();
  const role = resolvePrimaryRole(user?.main_role || user?.role);
  const links = getWorkspaceQuickLinks(role);
  const isDark = theme === 'dark';

  const workspaceLinks = [
    { label: 'My Workspace', path: '/workspace', icon: LayoutDashboard },
    { label: 'Vobiss Workspace', path: '/chat', icon: MessageCircle, badge: unreadChat },
    ...links.filter((l) => l.path !== '/profile' && l.path !== '/chat' && l.path !== '/workspace'),
    { label: 'Profile & Security', path: '/profile', icon: Settings },
  ];

  return (
    <>
      <div
        role="presentation"
        className={cn(
          'chat-mobile-nav-backdrop fixed inset-0 z-[60] bg-black/50 backdrop-blur-[2px] transition-opacity duration-200',
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={onClose}
        aria-hidden={!open}
      />
      <nav
        aria-label="Workspace navigation"
        className={cn(
          'chat-mobile-nav-drawer fixed inset-y-0 left-0 z-[70] flex w-[min(300px,88vw)] flex-col shadow-2xl transition-transform duration-200 ease-out',
          isDark ? 'bg-[#13151c] text-gray-100' : 'bg-white text-slate-900',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div
          className={cn(
            'flex items-center justify-between border-b px-4 py-3',
            isDark ? 'border-gray-800' : 'border-slate-200'
          )}
        >
          <div className="flex items-center gap-2.5">
            <img src="/vobiss-logo.png" alt="" className="h-9 w-9 object-contain" />
            <div>
              <p className="text-sm font-bold">Vobiss</p>
              <p className={cn('text-[11px]', isDark ? 'text-gray-500' : 'text-slate-500')}>Workspace</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              'rounded-lg p-2 transition active:scale-95',
              isDark ? 'text-gray-400 hover:bg-gray-800' : 'text-slate-500 hover:bg-slate-100'
            )}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-y-contain px-2 py-3">
          <p
            className={cn(
              'chat-section-label px-2 py-1 text-[10px] font-semibold uppercase tracking-wider',
              isDark ? 'text-gray-500' : 'text-slate-500'
            )}
          >
            Navigate
          </p>
          <ul className="space-y-0.5">
            {workspaceLinks.map((item) => {
              const Icon = item.icon || iconFor(item.path);
              const active = location.pathname === item.path;
              const badge = 'badge' in item ? (item as { badge?: number }).badge : 0;
              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    onClick={onClose}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition duration-150 active:scale-[0.98]',
                      active
                        ? isDark
                          ? 'bg-blue-600/20 text-blue-200'
                          : 'bg-blue-50 text-blue-700'
                        : isDark
                          ? 'text-gray-300 hover:bg-gray-800/80'
                          : 'text-slate-700 hover:bg-slate-50'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 opacity-80" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {badge > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        <div className={cn('border-t px-4 py-3', isDark ? 'border-gray-800' : 'border-slate-200')}>
          <p className={cn('flex items-center gap-2 text-xs', isDark ? 'text-gray-500' : 'text-slate-500')}>
            <Bell className="h-3.5 w-3.5" />
            Enterprise workspace · mobile
          </p>
        </div>
      </nav>
    </>
  );
}

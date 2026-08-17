import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Menu,
  X,
  Bell,
  BellOff,
  Sun,
  Moon,
  LogOut,
  User as UserIcon,
  LayoutDashboard,
  Clock,
  BookOpen,
} from 'lucide-react';
import { timeOfDayGreeting } from '@/components/ui/greeting-banner';
import { TodoPanel } from '@/components/todos/TodoPanel';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { SYSTEM_ADMIN_LABEL } from '@/config/roles';
import {
  getNotifications,
  markNotificationAsRead,
  type SystemNotification,
} from '@/api';
import { getChatUnreadTotal } from '@/api/chat';
import {
  isPushSupported,
  permissionState,
  enablePushNotifications,
  isCurrentlySubscribed,
} from '@/lib/webPush';
import { getPushPublicKey } from '@/api';
import { setAppBadge } from '@/lib/appBadge';
import { cn } from '@/lib/utils';
import { UserAvatar } from '@/components/UserAvatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface StaffHeaderProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

function formatUserAttribute(value?: string | null) {
  return String(value || '')
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function isAdminSuperAccount(user: any) {
  const role = String(user?.main_role || user?.role || '').trim().toLowerCase();
  const username = String(user?.username || '').trim().toLowerCase();
  const fullName =
    String(
      user?.full_name ||
        [user?.first_name, user?.last_name].filter(Boolean).join(' ')
    )
      .trim()
      .toLowerCase();
  return role === 'superadmin' && (username === 'superadmin' || fullName === 'admin super');
}

const StaffHeader: React.FC<StaffHeaderProps> = ({
  sidebarOpen,
  onToggleSidebar,
  theme,
  onToggleTheme,
}) => {
  const { user, logout } = useAuth();
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [chatUnread, setChatUnread] = useState(0);
  const [pushReady, setPushReady] = useState<{
    configured: boolean;
    permission: NotificationPermission;
    enabling: boolean;
  }>(() => ({
    configured: false,
    permission: typeof Notification !== 'undefined' ? Notification.permission : 'default',
    enabling: false,
  }));

  const isDark = theme === 'dark';
  const notifUnread = notifications.filter((n) => !n.read).length;
  const unreadCount = notifUnread + chatUnread;
  const [now, setNow] = useState(() => new Date());
  const [notifOpen, setNotifOpen] = useState(false);

  useEffect(() => {
    const open = () => setNotifOpen(true);
    window.addEventListener('staff:open-notifications', open);
    return () => window.removeEventListener('staff:open-notifications', open);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    void setAppBadge(unreadCount);
  }, [unreadCount]);

  const roleLabel =
    (isAdminSuperAccount(user) ? SYSTEM_ADMIN_LABEL : '') ||
    formatUserAttribute(user?.position) ||
    formatUserAttribute(user?.unit) ||
    (Array.isArray(user?.units) ? formatUserAttribute(user.units[0]) : '') ||
    'User';

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [data, chat] = await Promise.all([
          getNotifications(),
          getChatUnreadTotal().catch(() => ({ total: 0 })),
        ]);
        if (!cancelled) {
          setNotifications(Array.isArray(data) ? data : []);
          setChatUnread(chat?.total || 0);
        }
      } catch {
        // silent — sidebar surfaces the same error
      }
    };
    load();
    const id = window.setInterval(load, 15000);
    const handler = () => load();
    window.addEventListener('staff:notifications-changed', handler as EventListener);
    window.addEventListener('chat:unread-changed', handler as EventListener);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener('staff:notifications-changed', handler as EventListener);
      window.removeEventListener('chat:unread-changed', handler as EventListener);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isPushSupported()) {
        if (!cancelled) setPushReady((s) => ({ ...s, configured: false }));
        return;
      }
      try {
        const { configured } = await getPushPublicKey();
        const subscribed = await isCurrentlySubscribed();
        if (!cancelled) {
          setPushReady({
            configured,
            permission: subscribed ? 'granted' : permissionState(),
            enabling: false,
          });
        }
      } catch {
        if (!cancelled) setPushReady((s) => ({ ...s, configured: false }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const enablePush = async () => {
    if (pushReady.enabling) return;
    setPushReady((s) => ({ ...s, enabling: true }));
    try {
      if (!isPushSupported()) {
        toast.error('Push notifications are not supported in this browser.');
        return;
      }
      const ok = await enablePushNotifications();
      const perm = permissionState();
      setPushReady((s) => ({ ...s, permission: perm }));
      if (ok) {
        toast.success('Notifications enabled', {
          description: 'You will receive @mentions, approvals, and announcements on this device.',
        });
      } else if (perm === 'denied') {
        toast.warning('Notifications blocked', {
          description: 'Open browser site settings → Allow notifications, then try again.',
        });
      } else {
        toast.error('Could not enable notifications', {
          description: 'Check that VAPID keys are set in the backend .env (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).',
        });
      }
    } catch (e) {
      console.error('Enable push failed:', e);
      toast.error('Failed to enable notifications.');
    } finally {
      setPushReady((s) => ({ ...s, enabling: false }));
    }
  };

  const panelSurface = 'z-[100] border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)]';
  const iconBtn =
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-secondary)] transition duration-150 hover:bg-[var(--surface-hover)]';
  const displayName = isAdminSuperAccount(user) ? SYSTEM_ADMIN_LABEL : user?.full_name || user?.username || 'User';
  const firstName = user?.first_name || displayName.split(/\s+/)[0] || 'there';
  const timeLabel = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  return (
    <header
      className="staff-topbar sticky top-0 z-30 flex h-[var(--topbar-height)] shrink-0 items-center gap-1 overflow-visible border-b border-[var(--topbar-border)] bg-[var(--topbar-bg)] px-3 text-[var(--text-primary)] sm:gap-3 sm:px-5"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex min-w-0 shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-secondary)] transition duration-150 hover:bg-[var(--surface-hover)]"
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          aria-expanded={sidebarOpen}
        >
          {sidebarOpen ? <X className="h-5 w-5 md:hidden" /> : <Menu className="h-5 w-5 md:hidden" />}
          <Menu className="hidden h-[17px] w-[17px] md:block" />
        </button>
        <span className="ml-0.5 hidden items-center gap-1.5 text-[12px] text-[var(--text-secondary)] md:inline-flex">
          <Clock className="h-3.5 w-3.5" />
          {timeLabel}
        </span>
        <Link to="/system-guide" className={cn(iconBtn, 'hidden md:flex')} aria-label="User guide" title="User guide">
          <BookOpen className="h-[17px] w-[17px]" />
        </Link>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-center px-1">
        <TodoPanel />
      </div>

      <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1">
        {pushReady.configured && pushReady.permission !== 'granted' && (
          <button type="button" onClick={enablePush} disabled={pushReady.enabling} className={cn(iconBtn, 'hidden md:flex')} aria-label="Enable notifications" title="Enable push notifications">
            <BellOff className="h-[17px] w-[17px]" />
          </button>
        )}
        <Popover open={notifOpen} onOpenChange={setNotifOpen}>
          <PopoverTrigger asChild>
            <button type="button" className={cn(iconBtn, 'relative')} aria-label="Notifications">
              <Bell className="h-[17px] w-[17px]" />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent-red)] px-1 text-[9px] font-bold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            side="bottom"
            sideOffset={8}
            className="flex max-h-[min(75vh,32rem)] w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-0 text-[var(--text-primary)] shadow-[var(--shadow-md)]"
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3">
              <h3 className="text-sm font-semibold">Notifications</h3>
              {notifUnread > 0 && (
                <span className="rounded-full bg-[var(--accent-red)] px-2 py-0.5 text-[10px] font-semibold text-white">
                  {notifUnread} new
                </span>
              )}
            </div>
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
              {notifications.length === 0 && (
                <div className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">No notifications yet.</div>
              )}
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    'border-b border-[var(--border)] px-4 py-3 last:border-b-0',
                    !n.read && 'bg-[var(--accent-green-light)]'
                  )}
                >
                  <p className="text-sm font-medium">{n.title}</p>
                  <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-[var(--text-secondary)]">{n.message}</p>
                  {n.link_url && (
                    <Link to={n.link_url} className="mt-2 inline-flex text-xs font-semibold text-[var(--primary)] hover:underline">
                      Open →
                    </Link>
                  )}
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[11px] text-[var(--text-muted)]">{new Date(n.created_at).toLocaleString()}</span>
                    {!n.read && (
                      <button
                        type="button"
                        className="text-xs font-medium text-[var(--primary)] hover:underline"
                        onClick={async () => {
                          try {
                            await markNotificationAsRead(n.id);
                            setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
                            window.dispatchEvent(new CustomEvent('staff:notifications-changed'));
                          } catch (e) {
                            console.error(e);
                          }
                        }}
                      >
                        Mark as read
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {notifications.length > 0 && (
              <div className="border-t border-[var(--border)] px-3 py-2">
                <Link to="/workspace" className="block rounded-[var(--radius-sm)] px-2 py-1.5 text-center text-xs font-medium text-[var(--primary)] hover:bg-[var(--surface-hover)]">
                  View all on My Workspace
                </Link>
              </div>
            )}
          </PopoverContent>
        </Popover>
        <button type="button" onClick={onToggleTheme} className={cn(iconBtn, 'hidden md:flex')} aria-label="Toggle theme">
          {isDark ? <Sun className="h-[17px] w-[17px]" /> : <Moon className="h-[17px] w-[17px]" />}
        </button>
        <span className="mx-1 hidden h-4 w-px bg-[var(--border)] md:block" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex min-w-0 items-center gap-2.5 rounded-[var(--radius-sm)] pl-1 text-right" aria-label="Account menu">
              <span className="hidden min-w-0 md:block">
                <span className="block truncate text-[14px] font-semibold leading-tight text-[var(--text-primary)]">
                  {timeOfDayGreeting()}, {firstName}
                </span>
                {roleLabel && (
                  <span className="mt-0.5 block truncate text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--text-muted)]">
                    {roleLabel}
                  </span>
                )}
              </span>
              <UserAvatar
                src={user?.avatar_url}
                name={user?.full_name || user?.username}
                className="h-[34px] w-[34px] text-[13px]"
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className={cn('w-64 overflow-hidden rounded-[var(--radius)] p-0', panelSurface)}>
            <div className="border-b border-[var(--border)] px-4 py-3">
              <p className="truncate text-sm font-semibold">{displayName}</p>
              <p className="truncate text-xs capitalize text-[var(--text-muted)]">{roleLabel || '—'}</p>
            </div>
            <DropdownMenuItem asChild className="cursor-pointer px-4 py-3">
              <Link to="/profile" className="flex items-center gap-3">
                <UserIcon className="h-4 w-4" />
                My profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="cursor-pointer px-4 py-3">
              <Link to="/workspace" className="flex items-center gap-3">
                <LayoutDashboard className="h-4 w-4" />
                My Workspace
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer px-4 py-3 md:hidden"
              onSelect={(e) => {
                e.preventDefault();
                onToggleTheme();
              }}
            >
              {isDark ? <Sun className="mr-3 h-4 w-4" /> : <Moon className="mr-3 h-4 w-4" />}
              {isDark ? 'Light mode' : 'Dark mode'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer px-4 py-3 text-[var(--accent-red)] focus:bg-[var(--accent-red-light)] focus:text-[var(--accent-red)]"
              onSelect={() => logout()}
            >
              <LogOut className="mr-3 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default StaffHeader;

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Bell,
  Activity,
  LogIn,
  FileText,
  Users,
  Package,
  RefreshCw,
  Zap,
  Ticket,
  BarChart3,
  Settings,
  BookOpen,
  DollarSign,
  ClipboardList,
  Globe,
  MapPin,
  CheckCheck,
  Shield,
  Layers,
  Bookmark,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  getWorkspace,
  markNotificationAsRead,
  type WorkspaceActivity,
  type WorkspaceData,
} from '@/api';
import {
  getWorkspaceQuickLinks,
  getPrimaryWorkspaceAction,
  getRoleWorkspaceTip,
  resolvePrimaryRole,
  normalizeMenuRole,
  SYSTEM_ADMIN_LABEL,
} from '@/config/roles';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getChatUnreadTotal, getBookmarks } from '@/api/chat';
import WorkspaceChatSection from '@/components/workspace/WorkspaceChatSection';
import WorkspaceAttentionSection from '@/components/workspace/WorkspaceAttentionSection';
import WorkspaceClockCard from '@/components/workspace/WorkspaceClockCard';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusPill } from '@/components/ui/status-pill';
import { GreetingBanner, OutlinePill } from '@/components/ui/greeting-banner';

const ACTION_META: Record<string, { label: string; icon: React.ElementType; tone: string }> = {
  login: { label: 'Signed in', icon: LogIn, tone: 'text-emerald-600' },
  create_user: { label: 'Created a user', icon: Users, tone: 'text-blue-600' },
  update_user: { label: 'Updated a user', icon: Users, tone: 'text-blue-600' },
  update_user_role: { label: 'Changed a user role', icon: Shield, tone: 'text-indigo-600' },
  delete_user: { label: 'Deleted a user', icon: Users, tone: 'text-red-600' },
  reset_password: { label: 'Reset a password', icon: Users, tone: 'text-amber-600' },
  create_request: { label: 'Submitted a request', icon: FileText, tone: 'text-violet-600' },
  approve_request: { label: 'Approved a request', icon: CheckCheck, tone: 'text-green-600' },
  reject_request: { label: 'Rejected a request', icon: FileText, tone: 'text-red-600' },
  create_item: { label: 'Added inventory item', icon: Package, tone: 'text-cyan-600' },
  update_item: { label: 'Updated inventory item', icon: Package, tone: 'text-cyan-600' },
};

function describeActivity(act: WorkspaceActivity): string {
  const d = act.details || {};
  const meta = ACTION_META[act.action];
  if (act.action === 'login') return 'Signed in to Vobiss';
  if (act.action === 'update_user_role' && d.new_role) {
    return `Role → ${String(d.new_role).replace(/_/g, ' ')}`;
  }
  if (act.action === 'create_user' && d.username) return `Created ${d.username}`;
  if (meta) return meta.label;
  return act.action.replace(/_/g, ' ');
}

function linkIcon(path: string): React.ElementType {
  if (path.includes('hr-self/attendance')) return LogIn;
  if (path.includes('hr-self')) return FileText;
  if (path.includes('dashboard')) return BarChart3;
  if (path.includes('ticket')) return Ticket;
  if (path.includes('finance') || path.includes('cash')) return DollarSign;
  if (path.includes('request') || path.includes('approval')) return ClipboardList;
  if (path.includes('field')) return MapPin;
  if (path.includes('inventory') || path.includes('stock')) return Package;
  if (path.includes('user')) return Users;
  if (path.includes('config') || path.includes('system-messages')) return Settings;
  if (path.includes('guide')) return BookOpen;
  if (path.includes('ip')) return Globe;
  if (path.includes('chat')) return Layers;
  return Zap;
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

const MyWorkspace: React.FC = () => {
  const { user } = useAuth();
  const rawRole = resolvePrimaryRole(user);
  const role = normalizeMenuRole(rawRole);
  const displayName = isAdminSuperAccount(user)
    ? SYSTEM_ADMIN_LABEL
    : user?.full_name ||
      [user?.first_name, user?.last_name].filter(Boolean).join(' ') ||
      user?.username ||
      'there';
  const firstName = displayName.split(/\s+/)[0] || displayName;

  const [data, setData] = useState<WorkspaceData | null>(null);
  const [chatUnread, setChatUnread] = useState(0);
  const [bookmarkCount, setBookmarkCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const primaryAction = useMemo(() => getPrimaryWorkspaceAction(role), [role]);
  const quickLinks = useMemo(
    () => getWorkspaceQuickLinks(role, user?.permissions),
    [role, user?.permissions]
  );
  const roleTip = useMemo(() => getRoleWorkspaceTip(role), [role]);
  const roleLabel =
    (isAdminSuperAccount(user) ? SYSTEM_ADMIN_LABEL : '') ||
    (String(user?.position || '').trim().toLowerCase() === 'director' ? formatUserAttribute(user?.position) : '') ||
    formatUserAttribute(user?.unit) ||
    (Array.isArray(user?.units) ? formatUserAttribute(user.units[0]) : '') ||
    'User';

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [ws, chat, bookmarks] = await Promise.all([
        getWorkspace(),
        getChatUnreadTotal().catch(() => ({ total: 0 })),
        getBookmarks().catch(() => []),
      ]);
      setData(ws);
      setChatUnread(chat.total);
      setBookmarkCount(bookmarks.length);
    } catch {
      setData(null);
      setChatUnread(0);
      setBookmarkCount(0);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const onChange = () => load(true);
    window.addEventListener('staff:notifications-changed', onChange as EventListener);
    window.addEventListener('chat:unread-changed', onChange);
    const interval = window.setInterval(() => load(true), 30000);
    return () => {
      window.removeEventListener('staff:notifications-changed', onChange as EventListener);
      window.removeEventListener('chat:unread-changed', onChange);
      window.clearInterval(interval);
    };
  }, [load]);

  const markRead = async (id: number) => {
    await markNotificationAsRead(id);
    window.dispatchEvent(new CustomEvent('staff:notifications-changed'));
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        notifications: prev.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
        stats: {
          ...prev.stats,
          unreadNotifications: Math.max(0, prev.stats.unreadNotifications - 1),
        },
      };
    });
  };

  const markAllRead = async () => {
    if (!data?.notifications.length) return;
    const unreadIds = data.notifications.filter((n) => !n.read).map((n) => n.id);
    if (!unreadIds.length) return;
    setMarkingAll(true);
    try {
      await Promise.all(unreadIds.map((id) => markNotificationAsRead(id)));
      window.dispatchEvent(new CustomEvent('staff:notifications-changed'));
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          notifications: prev.notifications.map((n) => ({ ...n, read: true })),
          stats: { ...prev.stats, unreadNotifications: 0 },
        };
      });
    } finally {
      setMarkingAll(false);
    }
  };

  const unread = data?.stats.unreadNotifications ?? 0;
  const attentionItems = data?.attentionItems ?? [];
  const attentionCount = data?.stats.attentionCount ?? attentionItems.length;
  const unreadNotifications = data?.notifications.filter((n) => !n.read) ?? [];
  const readNotifications = data?.notifications.filter((n) => n.read) ?? [];

  const metrics = [
    { label: 'Action items', value: attentionCount, icon: ClipboardList, link: undefined as string | undefined },
    { label: 'Alerts', value: unread, icon: Bell, link: undefined },
    { label: 'Workspace', value: chatUnread, icon: Layers, link: '/chat' },
    { label: 'Saved', value: bookmarkCount, icon: Bookmark, link: '/chat?view=saved' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <GreetingBanner
            name={firstName}
            pills={
              <>
                <OutlinePill>{roleLabel}</OutlinePill>
                {roleTip && <OutlinePill>{roleTip}</OutlinePill>}
              </>
            }
            actions={
              <>
                <Button type="button" variant="outline" size="sm" onClick={() => load(true)} disabled={refreshing}>
                  <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
                  Refresh
                </Button>
                {primaryAction && (
                  <Button asChild size="sm">
                    <Link to={primaryAction.path}>
                      <Zap className="h-4 w-4" />
                      {primaryAction.label}
                    </Link>
                  </Button>
                )}
              </>
            }
          />
        </div>
        <WorkspaceClockCard />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {metrics.map((m, i) => {
          const card = (
            <StatCard
              label={m.label}
              value={m.value}
              icon={m.icon}
              accentIndex={i}
            />
          );
          return m.link ? (
            <Link key={m.label} to={m.link} className="block">
              {card}
            </Link>
          ) : (
            <div key={m.label}>{card}</div>
          );
        })}
      </div>

      {/* Attention + chat */}
      <div className="grid gap-4 lg:grid-cols-2">
        <WorkspaceAttentionSection items={attentionItems} loading={loading} />
        <WorkspaceChatSection />
      </div>

      {/* Quick access */}
      <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Quick access</h2>
          <span className="text-[11px] text-[var(--text-muted)]">{quickLinks.length} tools</span>
        </div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {quickLinks.map((link) => {
            const Icon = linkIcon(link.path);
            return (
              <Link
                key={link.path}
                to={link.path}
                title={link.description}
                className="vobiss-card vobiss-card-interactive group flex flex-col items-center gap-2 px-2 py-3 text-center hover:bg-[var(--surface-hover)]"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary)] text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-[12px] font-medium text-[var(--text-primary)]">{link.label}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Notifications + activity */}
      <div className="grid gap-4 lg:grid-cols-5">
        <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)] lg:col-span-3">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Announcements</h2>
              {unread > 0 && (
                <StatusPill tone="danger">{unread} new</StatusPill>
              )}
            </div>
            {unread > 0 && (
              <button
                type="button"
                disabled={markingAll}
                onClick={markAllRead}
                className="text-[11px] font-medium text-[var(--primary)] hover:underline disabled:opacity-50"
              >
                {markingAll ? 'Updating…' : 'Mark all read'}
              </button>
            )}
          </div>
          <div className="max-h-[320px] overflow-y-auto">
            {loading ? (
              <div className="space-y-2 p-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 animate-pulse rounded-lg bg-[var(--surface-secondary)]" />
                ))}
              </div>
            ) : !data?.notifications.length ? (
              <EmptyState
                title="No announcements"
                description="When something needs the whole team, it will appear here."
                icon={Bell}
              />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {unreadNotifications.map((n) => (
                  <li key={n.id} className="bg-[var(--accent-amber-light)] px-4 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-[var(--text-primary)]">{n.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-[var(--text-secondary)]">{n.message}</p>
                        <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => markRead(n.id)}
                        className="shrink-0 text-[10px] font-medium text-[var(--primary)] hover:underline"
                      >
                        Read
                      </button>
                    </div>
                  </li>
                ))}
                {readNotifications.map((n) => (
                  <li key={n.id} className="px-4 py-2 opacity-75">
                    <p className="text-xs font-medium text-[var(--text-secondary)]">{n.title}</p>
                    <p className="line-clamp-1 text-[11px] text-[var(--text-muted)]">{n.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)] lg:col-span-2">
          <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Recent activity</h2>
          </div>
          <div className="max-h-[320px] overflow-y-auto p-2">
            {loading ? (
              <div className="space-y-2 p-2">
                {[1, 2, 4].map((i) => (
                  <div key={i} className="h-8 animate-pulse rounded bg-[var(--surface-secondary)]" />
                ))}
              </div>
            ) : !data?.activities.length ? (
              <EmptyState title="Quiet for now" description="Your recent actions will show up in this timeline." icon={Activity} />
            ) : (
              <ul className="space-y-0.5">
                {data.activities.slice(0, 12).map((act) => {
                  const meta = ACTION_META[act.action] || {
                    label: act.action,
                    icon: Activity,
                    tone: 'text-[var(--text-secondary)]',
                  };
                  const Icon = meta.icon;
                  return (
                    <li key={act.id} className="flex gap-3 rounded-[var(--radius-sm)] px-2 py-2 transition duration-150 hover:bg-[var(--surface-hover)]">
                      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--primary)]" />
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium leading-snug text-[var(--text-primary)]">
                          {describeActivity(act)}
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          {format(new Date(act.timestamp), 'MMM d · h:mm a')}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default MyWorkspace;

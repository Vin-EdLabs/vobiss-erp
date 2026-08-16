import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Layers, ArrowRight, RefreshCw, Bookmark } from 'lucide-react';
import {
  getChatChannels,
  getChatDms,
  getChatUnreadTotal,
  getBookmarks,
  type ChatChannel,
  type ChatDm,
} from '@/api/chat';
import { RECORD_TYPE_META } from '@/components/chat/RecordChatUI';
import { cn } from '@/lib/utils';
import { channelCountsForUnread } from '@/lib/chatUnread';
import { EmptyState } from '@/components/ui/empty-state';
import { UserAvatar } from '@/components/UserAvatar';

type ChatFeedItem = {
  id: string;
  kind: 'channel' | 'dm';
  title: string;
  senderName: string;
  preview: string;
  time: string | null;
  unread: number;
  initials?: string;
  avatarColor?: string;
  avatarUrl?: string | null;
  link: string;
  recordType?: string | null;
};

function formatChatPreview(body: string): string {
  const raw = String(body || '').trim();
  if (!raw || raw === '(attachment)' || raw === 'Attachment') return 'Sent a voice or file';
  return raw.replace(/@\[[^\]]+\]\(\d+\)/g, (m) => {
    const match = m.match(/@\[([^\]]+)\]/);
    return match ? `@${match[1]}` : m;
  });
}

function channelLink(ch: ChatChannel): string {
  return `/chat?channel=${encodeURIComponent(ch.id)}`;
}

function buildUnreadOnly(channels: ChatChannel[], dms: ChatDm[]): ChatFeedItem[] {
  const items: ChatFeedItem[] = [];

  for (const ch of channels) {
    if (!channelCountsForUnread(ch) || ch.unread_count <= 0) continue;
    const lm = ch.last_message;
    const isRecord = !!ch.record_type;
    items.push({
      id: ch.id,
      kind: 'channel',
      title: isRecord ? ch.name : `# ${ch.channel_type === 'general' || ch.name === 'general' ? 'General' : ch.channel_type === 'announcements' || ch.name === 'announcements' ? 'Announcements' : ch.name}`,
      senderName: lm?.sender_name || 'Someone',
      preview: lm ? formatChatPreview(lm.body) : 'New message',
      time: lm?.created_at || null,
      unread: ch.unread_count,
      link: channelLink(ch),
      recordType: ch.record_type,
    });
  }

  for (const dm of dms) {
    if (dm.unread_count <= 0) continue;
    const lm = dm.last_message;
    const other = dm.other_user;
    items.push({
      id: dm.id,
      kind: 'dm',
      title: other?.name || 'Direct message',
      senderName: lm?.sender_name || other?.name || 'Someone',
      preview: lm ? formatChatPreview(lm.body) : 'New message',
      time: lm?.created_at || null,
      unread: dm.unread_count,
      initials: other?.initials,
      avatarColor: other?.avatar_color,
      avatarUrl: other?.avatar_url,
      link: `/chat?dm=${encodeURIComponent(dm.id)}`,
    });
  }

  return items.sort((a, b) => {
    const ta = a.time ? new Date(a.time).getTime() : 0;
    const tb = b.time ? new Date(b.time).getTime() : 0;
    return tb - ta;
  });
}

export function WorkspaceChatSection() {
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [dms, setDms] = useState<ChatDm[]>([]);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [bookmarkCount, setBookmarkCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [ch, dm, unread, bookmarks] = await Promise.all([
        getChatChannels(),
        getChatDms(),
        getChatUnreadTotal(),
        getBookmarks().catch(() => []),
      ]);
      setChannels(ch);
      setDms(dm);
      setUnreadTotal(unread.total);
      setBookmarkCount(bookmarks.length);
    } catch {
      setChannels([]);
      setDms([]);
      setUnreadTotal(0);
      setBookmarkCount(0);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const onChatChange = () => load(true);
    window.addEventListener('chat:unread-changed', onChatChange);
    const interval = window.setInterval(() => load(true), 45000);
    return () => {
      window.removeEventListener('chat:unread-changed', onChatChange);
      window.clearInterval(interval);
    };
  }, [load]);

  const unreadItems = useMemo(() => buildUnreadOnly(channels, dms), [channels, dms]);
  const previewItems = unreadItems.slice(0, 4);

  return (
    <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
      <div className="relative flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2.5">
        <div className="relative flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--primary)] text-white">
            <Layers className="h-3.5 w-3.5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Vobiss Workspace</h2>
            <p className="text-[11px] text-[var(--text-muted)]">
              {unreadTotal > 0
                ? `${unreadTotal} unread message${unreadTotal === 1 ? '' : 's'}`
                : 'Team chat & record threads'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => load(true)}
            disabled={refreshing}
            className="rounded-lg p-1.5 text-[var(--text-muted)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
            title="Refresh"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          </button>
          <Link
            to="/chat"
            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-slate-800"
          >
            Open
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2 p-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-[var(--surface-secondary)]" />
          ))}
        </div>
      ) : unreadItems.length === 0 ? (
        <EmptyState
          title="No unread conversations"
          description="When teammates mention you or send a message, it will land here."
          icon={Layers}
        />
      ) : (
        <>
          <ul className="divide-y divide-[var(--border)] px-1 py-1">
            {previewItems.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <Link
                  to={item.link}
                  className="group flex items-center gap-2.5 rounded-lg px-2 py-2 transition hover:bg-[var(--surface-hover)]"
                >
                  {item.kind === 'dm' ? (
                    <UserAvatar
                      src={item.avatarUrl}
                      name={item.title}
                      colorClass={item.avatarColor || 'bg-slate-500'}
                      className="h-7 w-7 shrink-0 rounded-md text-[9px]"
                    />
                  ) : (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--surface-secondary)] text-[10px] font-semibold text-[var(--text-secondary)]">
                      {item.recordType && RECORD_TYPE_META[item.recordType]
                        ? RECORD_TYPE_META[item.recordType].badge
                        : '#'}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-[var(--text-primary)]">{item.title}</p>
                    <p className="truncate text-[11px] text-[var(--text-muted)]">
                      {item.senderName} · {item.preview}
                    </p>
                  </div>
                  <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                    {item.unread > 9 ? '9+' : item.unread}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-2">
            {unreadItems.length > previewItems.length ? (
              <Link to="/chat" className="text-[11px] font-medium text-blue-600 hover:underline">
                +{unreadItems.length - previewItems.length} more unread
              </Link>
            ) : (
              <span />
            )}
            {bookmarkCount > 0 && (
              <Link
                to="/chat?view=saved"
                className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-blue-600"
              >
                <Bookmark className="h-3 w-3" />
                {bookmarkCount} saved message{bookmarkCount === 1 ? '' : 's'}
              </Link>
            )}
          </div>
        </>
      )}
    </section>
  );
}

export default WorkspaceChatSection;

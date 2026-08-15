import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bookmark,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  X,
} from 'lucide-react';
import {
  getBookmarks,
  removeBookmark,
  type BookmarkedMessage,
} from '@/api/chat';
import { useToast } from '@/hooks/use-toast';

const AVATAR_COLORS = [
  'bg-teal-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-orange-400',
  'bg-blue-500',
  'bg-emerald-500',
  'bg-pink-500',
  'bg-slate-500',
];

function avatarColorFromName(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase() || '??';
}

function formatSavedListTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `Today · ${time}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${time}`;
}

function isPlaceholderBody(body: string) {
  const t = (body || '').trim();
  return !t || t === '(attachment)';
}

function cardPreview(bm: BookmarkedMessage): string {
  const { message: m } = bm;
  if (m.forwarded_from) {
    const body = (m.body || '').trim();
    const inner = body && !isPlaceholderBody(body) ? body : '';
    return inner ? `↪ Forwarded · ${inner.slice(0, 100)}${inner.length > 100 ? '…' : ''}` : '↪ Forwarded message';
  }
  const body = (m.body || '').trim();
  if (body && !isPlaceholderBody(body)) {
    return body.length > 120 ? `${body.slice(0, 119)}…` : body;
  }
  const att = m.attachments?.[0];
  if (att?.mime_type?.startsWith('audio/')) return '🎤 Voice note';
  if (att?.file_name) return `📎 ${att.file_name}`;
  return 'Message';
}

function groupLabel(bm: BookmarkedMessage): string {
  const { source } = bm.message;
  if (source.type === 'dm') return `${source.name} (DM)`;
  const n = source.name || 'channel';
  return n.startsWith('#') ? n : `#${n}`;
}

function groupKey(bm: BookmarkedMessage) {
  return `${bm.message.source.type}:${bm.message.source.id}`;
}

function SavedSkeleton() {
  return (
    <div className="chat-saved-card chat-saved-skeleton mb-3 rounded-lg border border-gray-800/80 p-3">
      <div className="flex gap-3">
        <div className="h-9 w-9 shrink-0 rounded-full bg-gray-700/60" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-3 w-32 rounded bg-gray-700/60" />
          <div className="h-3 w-full rounded bg-gray-700/40" />
          <div className="h-3 w-4/5 rounded bg-gray-700/40" />
          <div className="mt-2 flex gap-2">
            <div className="h-7 w-24 rounded bg-gray-700/50" />
            <div className="h-7 w-20 rounded bg-gray-700/50" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function SavedMessagesPanel({
  onClose,
  onGoToMessage,
  onBookmarksChange,
}: {
  onClose: () => void;
  onGoToMessage: (bm: BookmarkedMessage) => void;
  onBookmarksChange?: (bookmarks: BookmarkedMessage[]) => void;
}) {
  const { toast } = useToast();
  const [bookmarks, setBookmarks] = useState<BookmarkedMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const list = await getBookmarks();
      setBookmarks(list);
      onBookmarksChange?.(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load saved messages');
      setBookmarks([]);
      onBookmarksChange?.([]);
    } finally {
      setIsLoading(false);
    }
  }, [onBookmarksChange]);

  useEffect(() => {
    load();
  }, [load]);

  const q = search.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return bookmarks;
    return bookmarks.filter((bm) => {
      const hay = [
        bm.message.sender_name,
        bm.message.body,
        bm.message.source.name,
        cardPreview(bm),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [bookmarks, q]);

  const grouped = useMemo(() => {
    const map = new Map<string, BookmarkedMessage[]>();
    for (const bm of filtered) {
      const key = groupKey(bm);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(bm);
    }
    return [...map.entries()].map(([key, items]) => ({
      key,
      label: groupLabel(items[0]),
      items,
    }));
  }, [filtered]);

  const handleRemove = async (bm: BookmarkedMessage) => {
    const prev = bookmarks;
    setRemovingId(bm.bookmark_id);
    setBookmarks((list) => list.filter((b) => b.bookmark_id !== bm.bookmark_id));
    onBookmarksChange?.(prev.filter((b) => b.bookmark_id !== bm.bookmark_id));
    try {
      await removeBookmark(bm.bookmark_id);
      toast({ title: 'Bookmark removed' });
    } catch (e) {
      setBookmarks(prev);
      onBookmarksChange?.(prev);
      toast({
        title: 'Could not remove bookmark',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="chat-saved-panel flex min-h-0 flex-1 flex-col">
      <div className="chat-topbar flex items-center justify-between gap-3 border-b border-gray-800 px-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <Bookmark className="h-4 w-4 shrink-0 text-amber-400/90" />
          <h2 className="chat-topbar-title truncate text-white">Saved messages</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="chat-icon-btn rounded-lg px-2 py-1.5 text-xs text-gray-400 hover:text-white"
        >
          <X className="mr-1 inline h-4 w-4" />
          Close
        </button>
      </div>

      <div className="border-b border-gray-800 px-4 py-3 sm:px-5">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-500" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search saved messages…"
            className="chat-search-input w-full rounded-lg border border-gray-700 bg-[#0f1117] py-2 pl-8 pr-2 text-xs text-gray-200 placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="chat-saved-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        {isLoading && (
          <>
            <SavedSkeleton />
            <SavedSkeleton />
            <SavedSkeleton />
          </>
        )}

        {!isLoading && error && (
          <div className="chat-saved-empty text-center">
            <p className="text-sm text-gray-400">{error}</p>
            <button
              type="button"
              onClick={load}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          </div>
        )}

        {!isLoading && !error && bookmarks.length === 0 && (
          <div className="chat-saved-empty flex flex-col items-center py-12 text-center">
            <Bookmark className="mb-3 h-10 w-10 text-gray-600" strokeWidth={1.25} />
            <p className="max-w-xs text-sm text-gray-500">
              No saved messages yet — bookmark any message to find it here
            </p>
          </div>
        )}

        {!isLoading && !error && bookmarks.length > 0 && filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-500">No saved messages match your search</p>
        )}

        {!isLoading &&
          !error &&
          grouped.map((group) => (
            <div key={group.key} className="mb-6">
              <div className="my-4 flex justify-center">
                <span className="chat-date-pill">{group.label}</span>
              </div>
              {group.items.map((bm) => {
                const isSystem = bm.message.message_type === 'system';
                const sender = isSystem ? 'System' : bm.message.sender_name || 'Unknown';
                const att = bm.message.attachments?.[0];

                return (
                  <div
                    key={bm.bookmark_id}
                    className="chat-saved-card mb-3 rounded-lg border border-gray-800/80 bg-[#13151c]/80 p-3"
                  >
                    <div className="flex gap-3">
                      {isSystem ? (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-700/80 text-gray-400">
                          <Settings className="h-4 w-4" />
                        </div>
                      ) : (
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${avatarColorFromName(sender)}`}
                        >
                          {initialsFromName(sender)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-[13px] font-semibold text-gray-100">{sender}</span>
                          <span className="shrink-0 text-[11px] text-gray-500">
                            {formatSavedListTime(bm.message.created_at)}
                          </span>
                        </div>
                        <p className="mt-1 text-[13px] leading-snug text-gray-300">{cardPreview(bm)}</p>
                        {att && !isPlaceholderBody(bm.message.body) && (
                          <span className="chat-saved-att-pill mt-1.5 inline-flex text-xs text-gray-500">
                            📎 {att.file_name}
                          </span>
                        )}
                        {att && isPlaceholderBody(bm.message.body) && !cardPreview(bm).startsWith('📎') && (
                          <span className="chat-saved-att-pill mt-1.5 inline-flex text-xs text-gray-500">
                            📎 {att.file_name}
                          </span>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => onGoToMessage(bm)}
                            className="chat-saved-btn inline-flex items-center gap-1 rounded-md border border-gray-700/80 px-2.5 py-1 text-[11px] text-gray-300 hover:bg-gray-800/60"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Go to message
                          </button>
                          <button
                            type="button"
                            disabled={removingId === bm.bookmark_id}
                            onClick={() => handleRemove(bm)}
                            className="chat-saved-btn chat-saved-btn--danger inline-flex items-center gap-1 rounded-md border border-gray-700/80 px-2.5 py-1 text-[11px] text-gray-400 hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
                          >
                            {removingId === bm.bookmark_id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
      </div>
    </div>
  );
}

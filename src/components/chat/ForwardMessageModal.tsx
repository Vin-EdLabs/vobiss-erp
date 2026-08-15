import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import {
  forwardMessage,
  type ChatChannel,
  type ChatDm,
  type ChatMessage,
} from '@/api/chat';

export type ForwardDestination = { type: 'channel' | 'dm'; id: string; name: string };

function isPlaceholderBody(body: string) {
  const t = (body || '').trim();
  return !t || t === '(attachment)';
}

function previewOriginal(msg: ChatMessage): string {
  const origin = msg.forwardedOrigin;
  const body = (origin?.body ?? msg.body ?? '').trim();
  if (body && !isPlaceholderBody(body)) {
    return body.length > 80 ? `${body.slice(0, 79)}…` : body;
  }
  const att = origin?.attachments?.[0] ?? msg.attachments?.[0];
  if (att?.file_name) return `📎 ${att.file_name}`;
  if ((msg.attachments || []).some((a) => (a.mime_type || '').startsWith('audio/'))) return 'Voice message';
  return 'Message';
}

function sortChannels(channels: ChatChannel[]): ChatChannel[] {
  return [...channels].sort((a, b) => {
    if (a.name === 'general') return -1;
    if (b.name === 'general') return 1;
    return a.name.localeCompare(b.name);
  });
}

export function ForwardedOriginBanner({ origin }: { origin: NonNullable<ChatMessage['forwardedOrigin']> }) {
  const body = (origin.body || '').trim();
  const showBody = body && !isPlaceholderBody(body);
  const firstAtt = origin.attachments?.[0];

  return (
    <div className="chat-forward-banner mb-2">
      <p className="chat-forward-banner-from">
        ↪ Forwarded from {origin.sender_name}
      </p>
      {showBody ? (
        <p className="chat-forward-banner-body">
          {body.length > 80 ? `${body.slice(0, 79)}…` : body}
        </p>
      ) : firstAtt?.file_name ? (
        <p className="chat-forward-banner-body">📎 {firstAtt.file_name}</p>
      ) : null}
    </div>
  );
}

export function ForwardMessageModal({
  message,
  channels,
  dms,
  onlineIds,
  onClose,
  onForwardComplete,
}: {
  message: ChatMessage;
  channels: ChatChannel[];
  dms: ChatDm[];
  onlineIds: Set<number>;
  onClose: () => void;
  onForwardComplete: (result: {
    forwarded: { destinationId: string; messageId: string }[];
  }) => void;
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ForwardDestination[]>([]);
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = search.trim().toLowerCase();

  const channelList = useMemo(() => {
    const list = sortChannels(channels);
    if (!q) return list;
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q)
    );
  }, [channels, q]);

  const dmList = useMemo(() => {
    if (!q) return dms;
    return dms.filter((d) => (d.other_user?.name || '').toLowerCase().includes(q));
  }, [dms, q]);

  const toggle = useCallback((dest: ForwardDestination) => {
    setSelected((prev) => {
      const exists = prev.some((s) => s.type === dest.type && s.id === dest.id);
      if (exists) return prev.filter((s) => !(s.type === dest.type && s.id === dest.id));
      if (prev.length >= 10) return prev;
      return [...prev, dest];
    });
  }, []);

  const isSelected = (type: 'channel' | 'dm', id: string) =>
    selected.some((s) => s.type === type && s.id === id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSubmit = async () => {
    if (!selected.length || isSubmitting) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await forwardMessage(
        message.id,
        selected.map((s) => ({ type: s.type, id: s.id })),
        note
      );
      onForwardComplete(result);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Forward failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const originalName = message.forwardedOrigin?.sender_name ?? message.sender_name;
  const originalInitials = message.sender_initials;

  return (
    <div
      className="chat-modal fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="forward-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="chat-modal-panel chat-forward-modal w-full max-w-[460px] rounded-xl border border-gray-700 bg-[#13151c] p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 id="forward-modal-title" className="chat-modal-title font-semibold text-white">
            Forward message
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="chat-icon-btn rounded p-1 text-gray-400 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="chat-forward-preview mb-3 rounded-lg border border-gray-800 bg-[#0f1117] p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            Forwarding
          </p>
          <div className="flex items-start gap-2.5">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${message.sender_avatar_color}`}
            >
              {originalInitials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-200">{originalName}</p>
              <p className="mt-0.5 text-xs text-gray-500">{previewOriginal(message)}</p>
            </div>
          </div>
        </div>

        {selected.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {selected.map((s) => (
              <span
                key={`${s.type}-${s.id}`}
                className="chat-forward-pill inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
              >
                {s.type === 'channel' ? `#${s.name}` : s.name}
                <button
                  type="button"
                  onClick={() => toggle(s)}
                  className="rounded-full p-0.5 hover:bg-gray-700/60"
                  aria-label={`Remove ${s.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            type="search"
            placeholder="Search channels and people…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-[#0f1117] py-2 pl-9 pr-3 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="chat-modal-list mb-3 max-h-52 overflow-y-auto rounded-lg border border-gray-800">
          <p className="sticky top-0 z-10 bg-[#13151c] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            Channels
          </p>
          {channelList.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-500">No channels match</p>
          ) : (
            channelList.map((ch) => {
              const dest: ForwardDestination = {
                type: 'channel',
                id: ch.id,
                name: ch.name,
              };
              const checked = isSelected('channel', ch.id);
              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => toggle(dest)}
                  className={`chat-forward-row flex w-full items-center gap-3 px-3 py-2 text-left ${
                    checked ? 'chat-forward-row--selected' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    readOnly
                    checked={checked}
                    className="chat-forward-checkbox shrink-0"
                    tabIndex={-1}
                  />
                  <span className="text-sm text-gray-200">#{ch.name}</span>
                </button>
              );
            })
          )}

          <p className="sticky top-0 z-10 mt-1 border-t border-gray-800 bg-[#13151c] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            Direct messages
          </p>
          {dmList.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-500">No conversations match</p>
          ) : (
            dmList.map((dm) => {
              const name = dm.other_user?.name || 'Unknown';
              const dest: ForwardDestination = { type: 'dm', id: dm.id, name };
              const checked = isSelected('dm', dm.id);
              const online = dm.other_user && onlineIds.has(dm.other_user.id);
              return (
                <button
                  key={dm.id}
                  type="button"
                  onClick={() => toggle(dest)}
                  className={`chat-forward-row flex w-full items-center gap-3 px-3 py-2 text-left ${
                    checked ? 'chat-forward-row--selected' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    readOnly
                    checked={checked}
                    className="chat-forward-checkbox shrink-0"
                    tabIndex={-1}
                  />
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                      dm.other_user?.avatar_color || 'bg-slate-500'
                    }`}
                  >
                    {dm.other_user?.initials || '?'}
                  </div>
                  <span className="flex-1 text-sm text-gray-200">{name}</span>
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      online ? 'bg-emerald-500' : 'bg-gray-600'
                    }`}
                    title={online ? 'Online' : 'Offline'}
                  />
                </button>
              );
            })
          )}
        </div>

        <div className="relative mb-3">
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            Add a note (optional)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 500))}
            placeholder="Type something…"
            rows={2}
            className="w-full resize-none rounded-lg border border-gray-700 bg-[#0f1117] px-3 py-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
          />
          <span className="absolute bottom-2 right-2 text-[10px] text-gray-500">
            {note.length}/500
          </span>
        </div>

        {error && (
          <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!selected.length || isSubmitting}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Forward → {selected.length || ''}
          </button>
        </div>
      </div>
    </div>
  );
}

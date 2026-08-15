import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getChannelMessages, sendChannelMessage, type ChatMessage } from '@/api/chat';
import { postVobiCommand } from '@/api/vobi';
import type { VobiCommandMeta } from '@/api/vobi';
import { VobiMessageCard } from './VobiMessageCard';
import { VobiDigestCard, VobiThreadSummaryCard } from './VobiChatSummaryCard';
import { VobiCommandBar } from './VobiCommandBar';
import { useAuth } from '@/context/AuthContext';

function formatTime(value: string | Date) {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function initialsFor(user: { full_name?: string; first_name?: string; last_name?: string; username?: string } | null) {
  const name =
    user?.full_name ||
    [user?.first_name, user?.last_name].filter(Boolean).join(' ') ||
    user?.username ||
    'You';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || 'U';
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function VobiChatView({ channelId }: { channelId: string }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [thinking, setThinking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getChannelMessages(channelId);
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [channelId]);

  const handleSubmit = async (text: string) => {
    setThinking(true);
    try {
      await sendChannelMessage(channelId, text);
      await wait(850);
      await postVobiCommand(text, { persist: true });
      await load();
    } finally {
      setThinking(false);
    }
  };

  const postAboutPrompt = async () => {
    await handleSubmit('about vobi');
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-background-primary)]">
      <div className="vobi-fiber-bg flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-[#1D9E75]" />
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center px-4 py-8 text-center">
            <img
              src="/vobi-logo.png"
              alt="Vobi"
              className="h-16 w-auto max-w-[180px] rounded-xl object-contain"
              draggable={false}
            />
            <p className="mt-2 text-sm font-medium text-[var(--color-text-primary)]">
              Vobi is ready.
            </p>
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
              Ask about approvals, tickets, mentions, or what you missed.
            </p>
            <button
              type="button"
              onClick={() => void postAboutPrompt()}
              className="mt-3 rounded-full border border-[#1D9E75]/40 px-3 py-1 text-xs font-medium text-[#1D9E75] hover:bg-[#1D9E75]/10"
            >
              About Vobi
            </button>
          </div>
        )}
        <div className="flex flex-col gap-3">
          {messages.map((m) => (
            <VobiChatMessage key={m.id} message={m} userInitials={initialsFor(user)} />
          ))}
          {thinking && <TypingBubble />}
        </div>
        <div ref={bottomRef} />
      </div>
      <VobiCommandBar
        ref={inputRef}
        disabled={thinking}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

function VobiChatMessage({
  message,
  userInitials,
}: {
  message: ChatMessage;
  userInitials: string;
}) {
  if (message.message_type === 'vobi') {
    const meta = (message as ChatMessage & { meta?: VobiCommandMeta & { cards?: unknown[] } }).meta;
    const cards = Array.isArray(meta?.cards) ? meta.cards : undefined;
    return (
      <div className="flex items-start gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#111827] ring-1 ring-[#1D9E75]/35">
          <img
            src="/vobi-logo.png"
            alt=""
            className="h-11 w-11 max-w-none object-cover object-left"
            draggable={false}
          />
        </span>
        <div className="max-w-[82%]">
          <div className="rounded-[14px_14px_14px_3px] bg-[var(--color-background-secondary)] px-[13px] py-2.5 text-[13px] leading-[1.5] text-[var(--color-text-primary)]">
            <div className="whitespace-pre-line">{message.body}</div>
            {meta?.threadSummary && (
              <VobiThreadSummaryCard summary={meta.threadSummary} />
            )}
            {meta?.digest && (
              <VobiDigestCard digest={meta.digest} />
            )}
            {cards?.map((item) => (
              <VobiMessageCard key={(item as { id: string }).id} item={item as never} />
            ))}
          </div>
          <div className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
            {formatTime(message.created_at)}
          </div>
        </div>
      </div>
    );
  }
  if (message.message_type === 'user') {
    return (
      <div className="flex justify-end gap-2">
        <div className="max-w-[78%] text-right">
          <div className="rounded-[14px_14px_3px_14px] bg-[#111827] px-[13px] py-2.5 text-left text-[13px] leading-normal text-white">
            {message.body}
          </div>
          <div className="mt-1 text-[11px] text-[#9FE1CB]">
            {formatTime(message.created_at)}
          </div>
        </div>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-background-info)] text-[10px] font-bold text-white">
          {userInitials}
        </span>
      </div>
    );
  }
  return <p className="text-xs text-[var(--color-text-tertiary)]">{message.body}</p>;
}

function TypingBubble() {
  return (
    <div className="flex items-start gap-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#111827] ring-1 ring-[#1D9E75]/35">
        <img
          src="/vobi-logo.png"
          alt=""
          className="h-11 w-11 max-w-none object-cover object-left"
          draggable={false}
        />
      </span>
      <div className="rounded-[14px_14px_14px_3px] bg-[var(--color-background-secondary)] px-[13px] py-3">
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="vobi-typing-dot h-1.5 w-1.5 rounded-full bg-[#1D9E75]"
              style={{ animationDelay: `${i * 140}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
